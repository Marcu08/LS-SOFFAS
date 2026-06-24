const UploadWizard = {
  step: 0,
  rawId: null,
  ocrData: null,
  ocrRawText: null,
  validation: null,
  duplicate: null,
  warnings: [],
  ocrOrigValues: {},

  render(el) {
    this.step = 0;
    this.rawId = null;
    this.ocrData = null;
    this.ocrRawText = null;
    this.validation = null;
    this.duplicate = null;
    this.warnings = [];
    this.ocrOrigValues = {};
    el.innerHTML = this.renderStepUpload();
    this.attachStepUpload(el);
  },

  renderStepUpload() {
    return `
      <div class="card">
        <div class="card-title">Carica Bolla PDF</div>
        <div class="dropzone" id="dz-upload">
          <div class="dropzone-icon">📄</div>
          <div class="dropzone-text">Trascina il PDF qui o <strong>clicca per selezionare</strong></div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Formato: PDF (anche multipagina) - Max 50MB</div>
        </div>
        <input type="file" id="pdf-input-wiz" accept=".pdf" style="display:none">
        <div id="wiz-progress" style="display:none;margin-top:12px;"></div>
      </div>
    `;
  },

  attachStepUpload(el) {
    const dz = document.getElementById("dz-upload");
    const inp = document.getElementById("pdf-input-wiz");
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
    if (!file.name.endsWith(".pdf")) { App.toast("Solo file PDF supportati", "error"); return; }
    const prog = document.getElementById("wiz-progress");
    prog.style.display = "block";
    prog.innerHTML = '<div style="text-align:center;padding:12px;"><div class="loading-spinner" style="margin:0 auto 8px;width:24px;height:24px;border-width:3px;"></div><span style="font-size:13px;color:var(--gray-500);">Caricamento PDF in corso...</span></div>';

    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await App.apiFormData("/documenti/upload", fd);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.rawId = data.raw_id;
      App.toast("PDF caricato, avvio OCR...", "info");
      await this.startProcessing();
    } catch (e) {
      prog.innerHTML = '<p style="color:var(--danger);text-align:center;">Errore: ' + e.message + "</p>";
    }
  },

  async startProcessing() {
    const prog = document.getElementById("wiz-progress");
    prog.innerHTML = `
      <div style="text-align:center;padding:16px;">
        <div class="loading-spinner" style="margin:0 auto 12px;width:32px;height:32px;border-width:4px;"></div>
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Analisi documento in corso...</div>
        <div style="font-size:12px;color:var(--gray-500);line-height:1.8;">
          <div>✔ PDF caricato</div>
          <div id="ocr-status">🔄 Riconoscimento testo...</div>
          <div>⏳ Estrazione dati...</div>
          <div>⏳ Validazione...</div>
        </div>
        <div class="status-text" style="font-size:12px;color:var(--gray-400);margin-top:8px;">Elaborazione in corso...</div>
      </div>
    `;

    try {
      const res = await App.api("/documenti/raw/" + this.rawId + "/process", { method: "POST" });
      if (res.status !== 202) {
        const data = await res.json();
        throw new Error(data.error || data.message);
      }
      await this.pollForResult();
    } catch (e) {
      this.renderError("Elaborazione fallita", e.message);
    }
  },

  async pollForResult() {
    const prog = document.getElementById("wiz-progress");
    let dots = 0;

    while (true) {
      await new Promise(r => setTimeout(r, 2000));

      try {
        const res = await App.api("/documenti/raw/" + this.rawId);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.stato === "needs_review" || data.stato === "ready_to_confirm") {
          this.ocrData = data.dati_estratti || {};
          this.ocrRawText = data.ocr_raw_text;
          if (!this.ocrRawText) console.warn("ocr_raw_text is empty/null", data);
          this.validation = data.validation || {};
          this.duplicate = data.duplicate || { duplicate: false };
          this.warnings = (data.validation?.warnings || []).slice();
          if (data.duplicate?.duplicate) {
            this.warnings.push("Duplicato: bolla #" + (data.dati_estratti?.numero_bolla || "") + " già presente");
          }
          this.renderPreview();
          return;
        }

        if (data.stato === "error") {
          this.renderError("OCR fallito", data.error_message || "Errore sconosciuto", () => this.startProcessing());
          return;
        }

        dots = (dots + 1) % 4;
        const st = prog.querySelector(".status-text");
        if (st) st.textContent = "Elaborazione in corso" + ".".repeat(dots);
      } catch (e) {
        console.error("Poll error:", e);
      }
    }
  },

  renderPreview() {
    const content = document.getElementById("app-content");
    const data = this.ocrData || {};
    const v = this.validation || {};
    const dup = this.duplicate || {};

    let warningHtml = "";
    if (this.warnings.length > 0) {
      warningHtml = '<div class="card" style="border:2px solid var(--warning);margin-bottom:16px;">' +
        '<div class="card-title" style="color:var(--warning);">⚠️ Warning</div>' +
        this.warnings.map((w) => '<p style="font-size:13px;margin:4px 0;">• ' + w + "</p>").join("") +
        "</div>";
    }

    if (dup.duplicate) {
      const ex = dup.existing || {};
      warningHtml += '<div class="card" style="border:2px solid var(--danger);margin-bottom:16px;">' +
        '<div class="card-title" style="color:var(--danger);">📋 Documento già presente</div>' +
        '<p style="font-size:13px;">Bolla <strong>' + (ex.numero_bolla || "") + '</strong> (' + (ex.tipo || "") + ")</p>" +
        '<p style="font-size:13px;">Data: ' + App.formatDate(ex.data_documento) + " | Colli: " + (ex.colli || 0) + " | Peso: " + App.formatNumber(ex.peso_totale) + "</p>" +
        '<div class="btn-group" style="margin-top:8px;">' +
        '<button class="btn btn-warning" onclick="UploadWizard.forceConfirm()">Conferma comunque</button>' +
        '<button class="btn btn-outline" onclick="UploadWizard.cancel()">Annulla</button></div>' +
        "</div>";
    }

    content.innerHTML = `
      ${warningHtml}
      <div class="card">
        <div class="card-title">Dati Estratti</div>
        <form id="preview-form">
          <div class="form-row">
            <div class="form-group">
              <label>Tipo *</label>
              <select id="pw-tipo" class="${!data.tipo ? 'field-missing' : ''}">
                <option value="ENTRATA">ENTRATA (merce in arrivo)</option>
                <option value="USCITA">USCITA (merce in partenza)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Numero Bolla *</label>
              <input type="text" id="pw-numero_bolla" value="${data.numero_bolla || ''}" class="${!data.numero_bolla ? 'field-missing' : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Data Documento *</label>
              <input type="date" id="pw-data_documento" value="${this.formatDateForInput(data.data_documento)}" class="${!data.data_documento ? 'field-missing' : ''}">
            </div>
            <div class="form-group">
              <label>Data Carico</label>
              <input type="date" id="pw-data_carico" value="${this.formatDateForInput(data.data_carico) || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Numero Documento</label>
              <input type="text" id="pw-numero_documento" value="${data.numero_documento || ''}">
            </div>
            <div class="form-group">
              <label>Numero Ordine / Picking</label>
              <input type="text" id="pw-picking" value="${data.picking || data.numero_ordine || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Codice Articolo *</label>
              <input type="text" id="pw-codice_articolo" value="${data.codice_articolo || ''}" class="${!data.codice_articolo ? 'field-missing' : ''}">
            </div>
          </div>
          <div class="form-group">
            <label>Descrizione Articolo *</label>
            <input type="text" id="pw-descrizione_articolo" value="${data.descrizione_articolo || ''}" class="${!data.descrizione_articolo ? 'field-missing' : ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Quantità (KG) *</label>
              <input type="number" id="pw-quantita" step="0.001" value="${data.quantita || ''}" class="${!data.quantita ? 'field-missing' : ''}">
            </div>
            <div class="form-group">
              <label>Unità</label>
              <select id="pw-um"><option value="KG" ${data.um === 'KG' ? 'selected' : ''}>KG</option><option value="LT" ${data.um === 'LT' ? 'selected' : ''}>LT</option><option value="MT" ${data.um === 'MT' ? 'selected' : ''}>MT</option><option value="PZ" ${data.um === 'PZ' ? 'selected' : ''}>PZ</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Colli</label>
              <input type="number" id="pw-colli" value="${data.colli || ''}">
            </div>
            <div class="form-group">
              <label>Peso Totale</label>
              <input type="number" id="pw-peso_totale" step="0.001" value="${data.peso_totale || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Pallet</label>
              <input type="number" id="pw-pallet" value="${data.pallet || ''}">
            </div>
            <div class="form-group">
              <label>Causale Trasporto</label>
              <input type="text" id="pw-causale_trasporto" value="${data.causale_trasporto || ''}">
            </div>
          </div>
          <div class="form-group" id="pw-dettaglio-group">
            <label>Packing List - Dettaglio</label>
            <div id="pw-dettaglio-container" style="overflow-x:auto;">
              <table style="width:100%;font-size:12px;min-width:400px;">
                <thead><tr><th>Partita/Lotto</th><th>Rotelle</th><th>Peso</th><th style="width:50px;"></th></tr></thead>
                <tbody id="pw-dettaglio-body"></tbody>
              </table>
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="UploadWizard.aggiungiRiga()">+ Aggiungi riga</button>
            </div>
            <div id="pw-dettaglio-uscita-note" style="display:none;font-size:12px;color:var(--gray-500);padding:8px;background:var(--gray-100);border-radius:4px;">Lotto derivato dal codice articolo — dettaglio non richiesto per USCITA</div>
          </div>
          <div class="form-group">
            <label>Note</label>
            <textarea id="pw-note" rows="2">${data.note || ''}</textarea>
          </div>
        </form>
        <div class="btn-group" style="justify-content:flex-end;margin-top:16px;">
          <button class="btn btn-outline" onclick="UploadWizard.toggleRawText()">📄 OCR Grezzo</button>
          <button class="btn btn-danger" onclick="UploadWizard.deleteDoc()">✕ Elimina</button>
          <button class="btn btn-outline" onclick="UploadWizard.cancel()">Annulla</button>
          <button class="btn btn-primary" id="pw-confirm-btn" ${v.errors && v.errors.length > 0 ? 'disabled' : ''}>Conferma Bolla</button>
        </div>
        <div id="pw-raw-text" style="display:none;margin-top:12px;">
          <pre style="font-size:11px;max-height:300px;overflow:auto;background:var(--gray-100);padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-word;">${this.ocrRawText || "N/A"}</pre>
        </div>
      </div>
    `;

    this.renderDettaglio((data.dettaglio || []));
    this.attachPreview();
  },

  toggleRawText() {
    const el = document.getElementById("pw-raw-text");
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
  },

  attachPreview() {
    this.saveOrigValues();

    ["pw-numero_bolla", "pw-data_documento", "pw-codice_articolo", "pw-descrizione_articolo", "pw-quantita"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => this.marcaModifica(el, id));
    });

    const tipoSel = document.getElementById("pw-tipo");
    if (tipoSel) {
      tipoSel.addEventListener("change", () => this.toggleDettaglio());
      this.toggleDettaglio();
    }

    document.getElementById("pw-confirm-btn").addEventListener("click", () => this.confirm());
  },

  toggleDettaglio() {
    const tipo = document.getElementById("pw-tipo")?.value;
    const group = document.getElementById("pw-dettaglio-group");
    const note = document.getElementById("pw-dettaglio-uscita-note");
    if (!group) return;
    if (tipo === "USCITA") {
      group.querySelector("table").style.display = "none";
      group.querySelector("button").style.display = "none";
      if (note) note.style.display = "block";
    } else {
      group.querySelector("table").style.display = "";
      group.querySelector("button").style.display = "";
      if (note) note.style.display = "none";
    }
  },

  saveOrigValues() {
    this.ocrOrigValues = {};
    ["pw-tipo", "pw-numero_bolla", "pw-data_documento", "pw-data_carico",
     "pw-numero_documento", "pw-picking", "pw-codice_articolo",
     "pw-descrizione_articolo", "pw-quantita", "pw-um", "pw-colli",
     "pw-peso_totale", "pw-pallet", "pw-causale_trasporto"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) this.ocrOrigValues[id] = el.value;
    });
  },

  marcaModifica(el, id) {
    const orig = this.ocrOrigValues[id];
    const curr = el.value;
    el.classList.toggle("field-modified", orig !== undefined && curr !== orig);
  },

  renderDettaglio(items) {
    const tbody = document.getElementById("pw-dettaglio-body");
    if (!tbody) return;
    if (!items || items.length === 0) items = [{ partita_lotto: "", numero_rotelle: 0, peso: 0 }];
    tbody.innerHTML = items.map((d, i) =>
      "<tr>" +
        "<td><input type='text' class='pw-dt-partita' value='" + (d.partita_lotto || "") + "' placeholder='Partita/Lotto' style='width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><input type='number' class='pw-dt-rotelle' value='" + (d.numero_rotelle || 0) + "' step='1' style='width:70px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><input type='number' class='pw-dt-peso' value='" + (d.peso || 0) + "' step='0.001' style='width:90px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><button class='btn btn-sm btn-outline' style='padding:2px 8px;font-size:11px;color:var(--danger);border-color:var(--danger);' onclick='UploadWizard.rimuoviRiga(this)'>×</button></td>" +
      "</tr>"
    ).join("");
  },

  getDettaglio() {
    const rows = document.querySelectorAll("#pw-dettaglio-body tr");
    const result = [];
    rows.forEach((tr) => {
      const partita = tr.querySelector(".pw-dt-partita")?.value?.trim() || "";
      const rotelle = parseInt(tr.querySelector(".pw-dt-rotelle")?.value) || 0;
      const peso = parseFloat(tr.querySelector(".pw-dt-peso")?.value) || 0;
      if (partita || rotelle || peso) result.push({ partita_lotto: partita, numero_rotelle: rotelle, peso });
    });
    return result;
  },

  aggiungiRiga() {
    const tbody = document.getElementById("pw-dettaglio-body");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td><input type='text' class='pw-dt-partita' value='' placeholder='Partita/Lotto' style='width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><input type='number' class='pw-dt-rotelle' value='0' step='1' style='width:70px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><input type='number' class='pw-dt-peso' value='0' step='0.001' style='width:90px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><button class='btn btn-sm btn-outline' style='padding:2px 8px;font-size:11px;color:var(--danger);border-color:var(--danger);' onclick='UploadWizard.rimuoviRiga(this)'>×</button></td>";
    tbody.appendChild(tr);
  },

  rimuoviRiga(btn) {
    const tr = btn.closest("tr");
    if (tr && document.querySelectorAll("#pw-dettaglio-body tr").length > 1) {
      tr.remove();
    } else {
      App.toast("Deve esserci almeno una riga", "warning");
    }
  },

  async confirm() {
    const g = (id) => document.getElementById(id)?.value?.trim() || "";
    const data = {
      tipo: g("pw-tipo"), numero_bolla: g("pw-numero_bolla"),
      numero_documento: g("pw-numero_documento"),
      picking: g("pw-picking") || null,
      data_documento: g("pw-data_documento"), data_carico: g("pw-data_carico"),
      codice_articolo: g("pw-codice_articolo"), descrizione_articolo: g("pw-descrizione_articolo"),
      um: g("pw-um"), quantita: parseFloat(g("pw-quantita")) || 0,
      colli: parseInt(g("pw-colli")) || 0, peso_totale: parseFloat(g("pw-peso_totale")) || 0,
      pallet: parseInt(g("pw-pallet")) || 0,
      causale_trasporto: g("pw-causale_trasporto") || null,
      note: g("pw-note"),
      dettaglio: this.getDettaglio(),
    };

    let missing = false;
    ["pw-numero_bolla", "pw-data_documento", "pw-codice_articolo", "pw-descrizione_articolo", "pw-quantita"].forEach((id) => {
      if (!document.getElementById(id)?.value?.trim()) missing = true;
    });
    if (missing) { App.toast("Completa i campi obbligatori evidenziati", "error"); return; }

    const btn = document.getElementById("pw-confirm-btn");
    btn.disabled = true; btn.textContent = "Salvataggio in corso...";

    try {
      const saveRes = await App.api("/documenti/raw/" + this.rawId, { method: "PUT", body: JSON.stringify(data) });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error);

      const res = await App.api("/documenti/raw/" + this.rawId + "/confirm", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      this.renderSuccess(result.documento);
    } catch (e) {
      App.toast("Errore: " + e.message, "error");
      btn.disabled = false; btn.textContent = "Conferma Bolla";
    }
  },

  renderSuccess(doc) {
    const content = document.getElementById("app-content");
    content.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;border:2px solid var(--success);">
        <div style="font-size:48px;margin-bottom:16px;">✅</div>
        <div class="card-title" style="color:var(--success);font-size:20px;">Documento confermato!</div>
        <p style="font-size:14px;margin:12px 0;">Bolla <strong>#${doc?.numero_bolla || ''}</strong> salvata come <strong>${doc?.tipo || ''}</strong></p>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:24px;">Picking: ${doc?.picking || 'N/A'}</p>
        <div class="btn-group" style="justify-content:center;">
          <button class="btn btn-primary" onclick="UploadWizard.render(document.getElementById('app-content'))">Nuova Bolla</button>
          <button class="btn btn-outline" onclick="App.navigate('dashboard')">Dashboard</button>
        </div>
      </div>
    `;
  },

  renderError(title, message, onRetry) {
    const content = document.getElementById("app-content");
    content.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;border:2px solid var(--danger);">
        <div style="font-size:48px;margin-bottom:16px;">❌</div>
        <div class="card-title" style="color:var(--danger);">${title}</div>
        <p style="font-size:13px;color:var(--gray-500);margin:12px 0;">${message}</p>
        <div class="btn-group" style="justify-content:center;">
          ${onRetry ? '<button class="btn btn-warning" onclick="(' + onRetry.toString() + ')()">Riprova</button>' : ''}
          <button class="btn btn-outline" onclick="UploadWizard.render(document.getElementById('app-content'))">Nuovo Upload</button>
          <button class="btn btn-outline" onclick="App.navigate('dashboard')">Dashboard</button>
        </div>
      </div>
    `;
  },

  forceConfirm() {
    document.getElementById("pw-confirm-btn")?.removeAttribute("disabled");
  },

  cancel() {
    if (this.rawId) {
      App.api("/documenti/raw/" + this.rawId, { method: "DELETE" }).catch(() => {});
    }
    this.render(document.getElementById("app-content"));
  },

  deleteDoc() {
    if (!confirm("Eliminare definitivamente questo documento?")) return;
    if (this.rawId) {
      App.api("/documenti/raw/" + this.rawId, { method: "DELETE" }).catch(() => {});
    }
    this.render(document.getElementById("app-content"));
  },

  formatDateForInput(val) {
    if (!val) return "";
    const p = val.split("/");
    if (p.length === 3) return p[2] + "-" + p[1].padStart(2, "0") + "-" + p[0].padStart(2, "0");
    return val;
  },
};
