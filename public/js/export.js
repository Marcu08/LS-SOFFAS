const ExportPage = {
  render(el) {
    const anno = new Date().getFullYear();
    el.innerHTML = `
      <div class="card card-soffass">
        <div class="card-title">Scarica File SOFFASS Completo</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">
          Workbook completo — 12 fogli mensili + catalogo bobine.
        </p>
        <div class="form-row" style="margin-bottom:8px;">
          <div class="form-group">
            <label>Anno</label>
            <input type="number" id="export-anno" value="${anno}" style="width:100px;">
          </div>
        </div>
        <button class="btn btn-primary" onclick="ExportPage.download('soffass')">Scarica BOBINE SOFFASS.xlsx</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:4px;">
        <div class="card card-compact card-giacenze">
          <div class="card-title">Esporta Giacenze</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Elenco giacenze attuali.</p>
          <button class="btn btn-success btn-sm" onclick="ExportPage.download('giacenze')">Scarica</button>
        </div>
        <div class="card card-compact card-movimenti">
          <div class="card-title">Esporta Movimenti</div>
          <p style="color:var(--gray-500);margin-bottom:6px;font-size:12px;">Storico movimenti con filtro date.</p>
          <div class="form-row" style="gap:6px;margin-bottom:6px;">
            <div class="form-group" style="flex:1;">
              <label style="font-size:11px;">Da</label>
              <input type="date" id="export-mov-from" style="font-size:12px;padding:3px 6px;">
            </div>
            <div class="form-group" style="flex:1;">
              <label style="font-size:11px;">A</label>
              <input type="date" id="export-mov-to" style="font-size:12px;padding:3px 6px;">
            </div>
          </div>
          <button class="btn btn-warning btn-sm" onclick="ExportPage.download('movimenti')">Scarica</button>
        </div>
        <div class="card card-compact card-pallet">
          <div class="card-title">Esporta Report Pallet</div>
          <p style="color:var(--gray-500);margin-bottom:8px;font-size:12px;">Workbook SOFFASS con tracking pallet (12 mesi).</p>
          <button class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="ExportPage.download('pallet')">Scarica</button>
        </div>
        <div class="card card-compact card-documenti">
          <div class="card-title">Esporta Documenti</div>
          <p style="color:var(--gray-500);margin-bottom:6px;font-size:12px;">Elenco documenti con filtro tipo.</p>
          <div style="margin-bottom:6px;">
            <select id="export-doc-tipo" style="font-size:12px;padding:3px 6px;width:100%;">
              <option value="">Tutti</option>
              <option value="ENTRATA">Entrate</option>
              <option value="USCITA">Uscite</option>
            </select>
          </div>
          <button class="btn btn-sm" style="background:#0891b2;color:white;" onclick="ExportPage.download('documenti')">Scarica</button>
        </div>
      </div>
    `;
  },

  async download(type) {
    let url = '/api/export/' + type;
    if (type === 'soffass' || type === 'pallet') {
      const anno = document.getElementById('export-anno')?.value || new Date().getFullYear();
      url += '?anno=' + anno;
    }
    if (type === 'movimenti') {
      const from = document.getElementById('export-mov-from')?.value || '';
      const to = document.getElementById('export-mov-to')?.value || '';
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const qs = p.toString();
      if (qs) url += '?' + qs;
    }
    if (type === 'documenti') {
      const tipo = document.getElementById('export-doc-tipo')?.value || '';
      if (tipo) url += '?tipo=' + tipo;
    }

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
      const now = new Date().toISOString().slice(0, 10);
      const names = { soffass: 'BOBINE_SOFFASS', giacenze: 'GIACENZE', movimenti: 'MOVIMENTI', pallet: 'PALLET', documenti: 'DOCUMENTI' };
      link.download = names[type] + '_' + now + '.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      App.toast('File scaricato con successo', 'success');
    } catch (e) {
      App.toast('Errore download: ' + e.message, 'error');
    }
  },
};
