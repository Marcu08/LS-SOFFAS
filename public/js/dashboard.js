const Dashboard = {
  async render(el) {
    el.innerHTML = '<p style="text-align:center;padding:40px;color:var(--gray-400);">Caricamento dashboard...</p>';
    try {
      const [riepilogoRes, rawRes] = await Promise.all([
        App.api("/giacenze/riepilogo"),
        App.api("/documenti/raw?limit=10"),
      ]);
      const riepilogo = await riepilogoRes.json();
      const rawData = await rawRes.json();
      el.innerHTML = this.renderDashboard(riepilogo, rawData);
      this.attach(el, riepilogo, rawData);
    } catch (e) {
      el.innerHTML = `<div class="card"><p style="text-align:center;padding:40px;color:var(--danger);">Errore: ${e.message}</p><p style="text-align:center;color:var(--gray-500);font-size:13px;">Il server potrebbe essere in fase di avvio (Render cold start).</p><button onclick="Dashboard.render(document.getElementById('app-content'))" style="display:block;margin:12px auto 0;padding:8px 20px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;">Riprova</button></div>`;
    }
  },

  renderDashboard(riepilogo, rawData) {
    const rawDocs = rawData?.documenti || [];
    const pending = rawDocs.filter((d) => d.stato === "extracted" || d.stato === "needs_review" || d.stato === "ready_to_confirm");
    const errors = rawDocs.filter((d) => d.stato === "error");

    let pendingHtml = "";
    if (pending.length > 0) {
      pendingHtml = `
        <div class="card">
          <div class="card-title" style="color:var(--warning);">⏳ Documenti in attesa di revisione</div>
          <div class="table-container">
            <table>
              <thead><tr><th>Data</th><th>Stato</th><th>Errore/Warning</th><th></th></tr></thead>
              <tbody>
                ${pending.map((d) => `
                  <tr>
                    <td>${App.formatDate(d.created_at)}</td>
                    <td><span class="badge badge-warning">${d.stato}</span></td>
                    <td style="font-size:12px;color:var(--gray-500);">${d.error_message || 'In attesa'}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="UploadWizard.render(document.getElementById('app-content'), '${d.id}')">Revisiona</button>
                    <button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="Dashboard.deleteRaw('${d.id}')" title="Elimina">✕</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    let errorHtml = "";
    if (errors.length > 0) {
      errorHtml = `
        <div class="card">
          <div class="card-title" style="color:var(--danger);">❌ Documenti in errore</div>
          <div class="table-container">
            <table>
              <thead><tr><th>Data</th><th>Errore</th><th></th></tr></thead>
              <tbody>
                ${errors.map((d) => `
                  <tr>
                    <td>${App.formatDate(d.created_at)}</td>
                    <td style="font-size:12px;color:var(--danger);">${d.error_message || 'Errore sconosciuto'}</td>
                    <td><button class="btn btn-sm btn-warning" onclick="Dashboard.retryRaw('${d.id}')">Riprova</button>
                    <button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="Dashboard.deleteRaw('${d.id}')" title="Elimina">✕</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    return `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${riepilogo.totale_articoli || 0}</div>
          <div class="stat-label">Articoli in Giacenza</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${riepilogo.totale_colli || 0}</div>
          <div class="stat-label">Colli Totali</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${App.formatNumber(riepilogo.totale_peso_kg)}</div>
          <div class="stat-label">Peso Totale (KG)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${riepilogo.totale_documenti || 0}</div>
          <div class="stat-label">Documenti Processati</div>
        </div>
      </div>
      ${pendingHtml}
      ${errorHtml}
      <div class="card">
        <div class="card-title">Ultimi Movimenti</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Bolla</th>
                <th>Articolo</th>
                <th>Descrizione</th>
                <th>Colli</th>
                <th>Peso</th>
              </tr>
            </thead>
            <tbody>
              ${riepilogo.ultimi_movimenti && riepilogo.ultimi_movimenti.length > 0
                ? riepilogo.ultimi_movimenti.map((m) => `
                    <tr>
                      <td>${App.formatDate(m.data_movimento)}</td>
                      <td><span class="badge badge-${m.tipo === "ENTRATA" ? "entrata" : "uscita"}">${m.tipo === "ENTRATA" ? "IN" : "OUT"}</span></td>
                      <td>${m.numero_bolla || ""}</td>
                      <td>${m.codice_articolo || ""}</td>
                      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.descrizione_articolo || ""}</td>
                      <td>${m.colli || 0}</td>
                      <td>${App.formatNumber(m.peso)}</td>
                    </tr>`).join("")
                : '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);">Nessun movimento registrato</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  attach(el, riepilogo, rawData) {},
};

Dashboard.retryRaw = async function (id) {
  try {
    const res = await App.api("/documenti/raw/" + id + "/retry", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    App.toast("Documento resettato, riprova l'OCR", "info");
    UploadWizard.render(document.getElementById("app-content"), id);
  } catch (e) {
    App.toast("Errore: " + e.message, "error");
  }
};

Dashboard.deleteRaw = async function (id) {
  if (!confirm("Eliminare questo documento?")) return;
  try {
    const res = await App.api("/documenti/raw/" + id, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    App.toast("Documento eliminato", "success");
    Dashboard.render(document.getElementById("app-content"));
  } catch (e) {
    App.toast("Errore: " + e.message, "error");
  }
};