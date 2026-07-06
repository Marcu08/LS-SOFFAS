const ExportPage = {
  render(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Scarica File SOFFASS (formato LUGLIO)</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica un Excel identico alla scheda mensile SOFFASS, pronto per il prossimo import.</p>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Mese</label>
            <select id="export-soffass-mese">
              <option value="1">GENNAIO</option>
              <option value="2">FEBBRAIO</option>
              <option value="3">MARZO</option>
              <option value="4">APRILE</option>
              <option value="5">MAGGIO</option>
              <option value="6">GIUGNO</option>
              <option value="7" selected>LUGLIO</option>
              <option value="8">AGOSTO</option>
              <option value="9">SETTEMBRE</option>
              <option value="10">OTTOBRE</option>
              <option value="11">NOVEMBRE</option>
              <option value="12">DICEMBRE</option>
            </select>
          </div>
          <div class="form-group">
            <label>Anno</label>
            <input type="number" id="export-soffass-anno" value="${new Date().getFullYear()}" style="width:100px;">
          </div>
        </div>
        <button class="btn btn-primary" onclick="ExportPage.download('soffass')">Scarica File SOFFASS</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Giacenze</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica l'elenco completo delle giacenze con colli, peso e pallet.</p>
        <button class="btn btn-success" onclick="ExportPage.download('giacenze')">Scarica Giacenze</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Movimenti</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica lo storico movimenti con filtro date.</p>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Da data</label>
            <input type="date" id="export-mov-from">
          </div>
          <div class="form-group">
            <label>A data</label>
            <input type="date" id="export-mov-to">
          </div>
        </div>
        <button class="btn btn-success" onclick="ExportPage.download('movimenti')">Scarica Movimenti</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Pallet (Riepilogo + Dettaglio)</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica report pallet con riepilogo per articolo e dettaglio giornaliero (simile al file SOFFASS).</p>
        <button class="btn btn-success" onclick="ExportPage.download('pallet')">Scarica Report Pallet</button>
      </div>
      <div class="card">
        <div class="card-title">Esporta Documenti</div>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Scarica l'elenco completo dei documenti processati.</p>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Tipo</label>
            <select id="export-doc-tipo">
              <option value="">Tutti</option>
              <option value="ENTRATA">Entrate</option>
              <option value="USCITA">Uscite</option>
            </select>
          </div>
        </div>
        <button class="btn btn-success" onclick="ExportPage.download('documenti')">Scarica Documenti</button>
      </div>
    `;
  },

  async download(type) {
    let url = '/api/export/' + type;
    if (type === 'soffass') {
      const mese = document.getElementById('export-soffass-mese')?.value || '7';
      const anno = document.getElementById('export-soffass-anno')?.value || new Date().getFullYear();
      url += '?mese=' + mese + '&anno=' + anno;
    }
    if (type === 'movimenti') {
      const from = document.getElementById('export-mov-from')?.value || '';
      const to = document.getElementById('export-mov-to')?.value || '';
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
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
      link.download = type + '_' + now + '.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      App.toast('File ' + type + ' scaricato con successo', 'success');
    } catch (e) {
      App.toast('Errore download: ' + e.message, 'error');
    }
  },
};
