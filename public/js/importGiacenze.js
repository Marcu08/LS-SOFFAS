const ImportGiacenze = {
  render(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Import Excel — Pareggio Giacenze</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
          Carica un file Excel con le giacenze da allineare. Colonne: <strong>Codice Articolo</strong> | <strong>Descrizione</strong> | <strong>Kg</strong> | <strong>Colli</strong> | <strong>Pallet</strong>
        </p>
        <div class="dropzone" id="import-dropzone">
          <div class="dropzone-icon">📊</div>
          <div class="dropzone-text">Trascina il file Excel qui o <strong>clicca per selezionare</strong></div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Formato: .xlsx</div>
        </div>
        <input type="file" id="import-excel-input" accept=".xlsx,.xls" style="display:none">
        <div id="import-status" style="display:none;margin-top:12px;"></div>
      </div>
      <div id="import-risultati" style="display:none;"></div>
    `;
    this.attach(el);
  },

  attach() {
    const dz = document.getElementById("import-dropzone");
    const inp = document.getElementById("import-excel-input");
    dz.addEventListener("click", () => inp.click());
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault(); dz.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
    });
    inp.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
    });
  },

  async handleFile(file) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      App.toast("Solo file Excel (.xlsx)", "error"); return;
    }
    const status = document.getElementById("import-status");
    status.style.display = "block";
    status.innerHTML = '<div style="text-align:center;padding:12px;"><div class="loading-spinner" style="margin:0 auto 8px;width:24px;height:24px;border-width:3px;"></div><span style="font-size:13px;color:var(--gray-500);">Importazione in corso...</span></div>';

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await App.apiFormData("/giacenze/import-excel", fd);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      status.style.display = "none";
      this.mostraRisultati(data);
    } catch (e) {
      status.innerHTML = '<p style="color:var(--danger);text-align:center;">Errore: ' + e.message + "</p>";
    }
  },

  mostraRisultati(data) {
    const el = document.getElementById("import-risultati");
    el.style.display = "block";
    const det = data.dettaglio || {};
    const items = det.aggiornati || [];
    el.innerHTML = `
      <div class="card" style="border:2px solid var(--success);">
        <div class="card-title" style="color:var(--success);">✅ Import Completato</div>
        <p style="font-size:14px;margin-bottom:12px;">${data.message}</p>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Codice Articolo</th>
                <th>Kg</th>
                <th>Colli</th>
              </tr>
            </thead>
            <tbody>
              ${items.length > 0 ? items.map(i => `
                <tr>
                  <td><strong>${i.codice_articolo}</strong></td>
                  <td>${App.formatNumber(i.kg)}</td>
                  <td>${i.colli || 0}</td>
                </tr>
              `).join("") : '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);">Nessun articolo elaborato</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="btn-group" style="margin-top:12px;">
          <button class="btn btn-primary" onclick="App.navigate('giacenze')">Vedi Giacenze</button>
          <button class="btn btn-outline" onclick="ImportGiacenze.render(document.getElementById('app-content'))">Nuovo Import</button>
        </div>
      </div>
    `;
  },
};