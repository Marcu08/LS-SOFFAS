const ExportPage = {
  render(el) {
    const anno = new Date().getFullYear();
    el.innerHTML = `
      <div class="card card-soffass">
        <div class="card-title">Scarica File SOFFASS Completo</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">
          Workbook completo — 12 fogli mensili + catalogo bobine, identico al file originale.
        </p>
        <div class="form-row" style="margin-bottom:8px;">
          <div class="form-group">
            <label>Anno</label>
            <input type="number" id="export-anno" value="${anno}" style="width:100px;">
          </div>
        </div>
        <button class="btn btn-primary" onclick="ExportPage.download('soffass')">Scarica BOBINE SOFFASS.xlsx</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:4px;">
        <div class="card card-compact card-giacenze">
          <div class="card-title">Esporta Giacenze</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Report SOFFASS con i dati delle giacenze.</p>
          <button class="btn btn-success btn-sm" onclick="ExportPage.download('giacenze')">Scarica</button>
        </div>
        <div class="card card-compact card-movimenti">
          <div class="card-title">Esporta Movimenti</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Report SOFFASS con lo storico movimenti.</p>
          <button class="btn btn-warning btn-sm" onclick="ExportPage.download('movimenti')">Scarica</button>
        </div>
        <div class="card card-compact card-pallet">
          <div class="card-title">Esporta Pallet</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Report SOFFASS con tracking pallet.</p>
          <button class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="ExportPage.download('pallet')">Scarica</button>
        </div>
        <div class="card card-compact card-documenti">
          <div class="card-title">Esporta Documenti</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Report SOFFASS con elenco documenti.</p>
          <button class="btn btn-sm" style="background:#0891b2;color:white;" onclick="ExportPage.download('documenti')">Scarica</button>
        </div>
      </div>
    `;
  },

  async download(type) {
    const anno = document.getElementById('export-anno')?.value || new Date().getFullYear();
    const url = '/api/export/' + type + '?anno=' + anno;

    try {
      const headers = {};
      if (App.state.token) headers['Authorization'] = 'Bearer ' + App.state.token;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Errore download');
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const names = { soffass: 'BOBINE_SOFFASS', giacenze: 'GIACENZE', movimenti: 'MOVIMENTI', pallet: 'PALLET', documenti: 'DOCUMENTI' };
      link.download = names[type] + '_' + anno + '.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      App.toast('File ' + type + ' scaricato con successo', 'success');
    } catch (e) {
      App.toast('Errore download: ' + e.message, 'error');
    }
  },
};
