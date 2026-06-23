const Dashboard = {
  async render(el) {
    el.innerHTML = '<p style="text-align:center;padding:40px;color:var(--gray-400);">Caricamento dashboard...</p>';
    try {
      const res = await App.api("/giacenze/riepilogo");
      const data = await res.json();
      el.innerHTML = this.renderDashboard(data);
      this.attach(el, data);
    } catch (e) {
      el.innerHTML = `<div class="card"><p style="text-align:center;padding:40px;color:var(--danger);">Errore: ${e.message}</p><p style="text-align:center;color:var(--gray-500);font-size:13px;">Le tabelle del database non sono state create. Vai su Supabase SQL Editor ed esegui lo schema.</p></div>`;
    }
  },

  renderDashboard(data) {
    return `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${data.totale_articoli || 0}</div>
          <div class="stat-label">Articoli in Giacenza</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${data.totale_colli || 0}</div>
          <div class="stat-label">Colli Totali</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${App.formatNumber(data.totale_peso_kg)}</div>
          <div class="stat-label">Peso Totale (KG)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.totale_documenti || 0}</div>
          <div class="stat-label">Documenti Processati</div>
        </div>
      </div>
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
              ${
                data.ultimi_movimenti && data.ultimi_movimenti.length > 0
                  ? data.ultimi_movimenti
                      .map(
                        (m) => `
                    <tr>
                      <td>${App.formatDate(m.data_movimento)}</td>
                      <td><span class="badge badge-${m.tipo === "ENTRATA" ? "entrata" : "uscita"}">${m.tipo === "ENTRATA" ? "IN" : "OUT"}</span></td>
                      <td>${m.numero_bolla || ""}</td>
                      <td>${m.codice_articolo || ""}</td>
                      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.descrizione_articolo || ""}</td>
                      <td>${m.colli || 0}</td>
                      <td>${App.formatNumber(m.peso)}</td>
                    </tr>`
                      )
                      .join("")
                  : '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);">Nessun movimento registrato</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  attach(el, data) {},
};