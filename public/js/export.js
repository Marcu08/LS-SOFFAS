const ExportPage = {
  render(el) {
    const anno = new Date().getFullYear();
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Scarica File SOFFASS Completo</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
          Scarica l'intero workbook SOFFASS con tutti i 12 fogli mensili + catalogo bobine,
          identico al file <strong>BOBINE SOFFASS - LIMITE (1).xlsx</strong>.
        </p>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Anno</label>
            <input type="number" id="export-anno" value="${anno}" style="width:120px;">
          </div>
        </div>
        <button class="btn btn-primary" onclick="ExportPage.download('soffass')" style="font-size:15px;padding:12px 24px;">
          Scarica BOBINE SOFFASS.xlsx
        </button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Giacenze</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica il report SOFFASS con i dati delle giacenze.</p>
        <button class="btn btn-success" onclick="ExportPage.download('giacenze')">Scarica Giacenze</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Movimenti</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica il report SOFFASS con lo storico movimenti.</p>
        <button class="btn btn-success" onclick="ExportPage.download('movimenti')">Scarica Movimenti</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Pallet (Riepilogo + Dettaglio)</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica il report SOFFASS con i dati dei pallet.</p>
        <button class="btn btn-success" onclick="ExportPage.download('pallet')">Scarica Report Pallet</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Documenti</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica il report SOFFASS con l'elenco dei documenti.</p>
        <button class="btn btn-success" onclick="ExportPage.download('documenti')">Scarica Documenti</button>
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
