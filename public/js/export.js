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
        <button class="btn btn-primary" onclick="ExportPage.download()">Scarica BOBINE SOFFASS.xlsx</button>
      </div>
    `;
  },

  async download() {
    const anno = document.getElementById('export-anno')?.value || new Date().getFullYear();
    const url = '/api/export/soffass?anno=' + anno;

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
      link.download = 'BOBINE_SOFFASS_' + anno + '.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      App.toast('File scaricato con successo', 'success');
    } catch (e) {
      App.toast('Errore download: ' + e.message, 'error');
    }
  },
};
