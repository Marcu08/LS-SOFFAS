const Ingresso = {
  ocrData: null,
  uploadedFile: null,
  duplicateDoc: null,
  ocrOrigValues: {},

  render(el) {
    this.ocrData = null; this.uploadedFile = null; this.duplicateDoc = null; this.ocrOrigValues = {};
    el.innerHTML = this.renderForm();
    this.attach(el);
  },

  renderForm() {
    return `
      <div class="card">
        <div class="card-title">Carica Bolla PDF</div>
        <div class="dropzone" id="dropzone">
          <div class="dropzone-icon">📄</div>
          <div class="dropzone-text">Trascina il PDF qui o <strong>clicca per selezionare</strong></div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Formato: PDF (anche multipagina) - Max 50MB</div>
        </div>
        <input type="file" id="pdf-input" accept=".pdf" style="display:none">
        <div id="upload-status" style="display:none;margin-top:12px;"></div>
      </div>
      <div id="ocr-result" style="display:none;"></div>
      <div id="duplicate-modal-area" style="display:none;"></div>
      <div id="form-manuale" style="display:none;">
        <div class="card">
          <div class="card-title">Dati Bolla</div>
          <form id="bolla-form">
            <div class="form-row">
              <div class="form-group">
                <label>Tipo *</label>
                <select id="f-tipo">
                  <option value="ENTRATA">ENTRATA (merce in arrivo)</option>
                  <option value="USCITA">USCITA (merce in partenza)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Numero Bolla *</label>
                <input type="text" id="f-numero_bolla" class="field-missing" placeholder="Es. 1020302100">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Data Documento *</label>
                <input type="date" id="f-data_documento" class="field-missing">
              </div>
              <div class="form-group">
                <label>Data Carico</label>
                <input type="date" id="f-data_carico">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Numero Documento</label>
                <input type="text" id="f-numero_documento" placeholder="Es. 0800926891">
              </div>
              <div class="form-group">
                <label>Numero Ordine</label>
                <input type="text" id="f-numero_ordine" placeholder="Es. 4403546880">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Numero Packing List</label>
                <input type="text" id="f-numero_packing_list" placeholder="Es. 800926891">
              </div>
              <div class="form-group">
                <label>Picking</label>
                <input type="text" id="f-picking" placeholder="Es. 4403546880">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Codice Articolo *</label>
                <input type="text" id="f-codice_articolo" class="field-missing" placeholder="Es. 300652N280A1257007">
              </div>
            </div>
            <div class="form-group">
              <label>Descrizione Articolo *</label>
              <input type="text" id="f-descrizione_articolo" class="field-missing" placeholder="Es. KT ECF FSC WHITE 2250/410">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Quantità (KG) *</label>
                <input type="number" id="f-quantita" step="1" class="field-missing" placeholder="0">
              </div>
              <div class="form-group">
                <label>Unità di Misura</label>
                <select id="f-um"><option value="KG">KG</option><option value="LT">LT</option><option value="MT">MT</option><option value="PZ">PZ</option></select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Colli / Unità</label>
                <input type="number" id="f-colli" placeholder="0">
              </div>
              <div class="form-group">
                <label>Peso Totale</label>
                <input type="number" id="f-peso_totale" step="0.001" placeholder="0">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Pallet</label>
                <input type="number" id="f-pallet" placeholder="0">
              </div>
              <div class="form-group">
                <label>Causale Trasporto</label>
                <input type="text" id="f-causale_trasporto" placeholder="Es. ADDEBITO">
              </div>
            </div>
            <div class="form-group">
              <label>Packing List - Dettaglio</label>
              <div id="dettaglio-container" style="overflow-x:auto;">
                <table style="width:100%;font-size:12px;min-width:400px;">
                  <thead><tr><th>Partita/Lotto</th><th>Rotelle</th><th>Peso</th><th style="width:50px;"></th></tr></thead>
                  <tbody id="dettaglio-body"></tbody>
                </table>
                <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="Ingresso.aggiungiRigaDettaglio()">+ Aggiungi riga</button>
              </div>
            </div>
            <div class="form-group">
              <label>Note</label>
              <textarea id="f-note" rows="2" placeholder="Eventuali note..."></textarea>
            </div>
          </form>
          <div class="btn-group" style="justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-outline" onclick="Ingresso.resetForm()">Annulla</button>
            <button class="btn btn-primary" id="btn-save-bolla">Salva Bolla</button>
          </div>
        </div>
      </div>
    `;
  },

  attach(el) {
    document.getElementById("dropzone").addEventListener("click", () => document.getElementById("pdf-input").click());
    document.getElementById("dropzone").addEventListener("dragover", (e) => { e.preventDefault(); document.getElementById("dropzone").classList.add("dragover"); });
    document.getElementById("dropzone").addEventListener("dragleave", () => document.getElementById("dropzone").classList.remove("dragover"));
    document.getElementById("dropzone").addEventListener("drop", (e) => { e.preventDefault(); document.getElementById("dropzone").classList.remove("dragover"); if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]); });
    document.getElementById("pdf-input").addEventListener("change", (e) => { if (e.target.files.length > 0) this.handleFile(e.target.files[0]); });
  },

  async handleFile(file) {
    if (!file.name.endsWith(".pdf")) { App.toast("Solo file PDF supportati", "error"); return; }
    this.uploadedFile = file;
    const status = document.getElementById("upload-status");
    status.style.display = "block";
    status.innerHTML = '<div style="text-align:center;padding:12px;"><div class="loading-spinner" style="margin:0 auto 8px;width:24px;height:24px;border-width:3px;"></div><span style="font-size:13px;color:var(--gray-500);">Caricamento e OCR in corso...</span></div>';

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await App.apiFormData("/documenti/upload", formData);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.ocrData = data.data || {};
      this.duplicateDoc = data.duplicate || null;

      if (data.ocr_error) App.toast("OCR parziale: dati modificabili manualmente", "warning");
      else App.toast("OCR completato", "success");

      status.style.display = "none";
      this.showForm(data.data);
      if (data.duplicate) this.showDuplicateWarning(data.duplicate);
    } catch (e) {
      status.innerHTML = '<p style="color:var(--danger);text-align:center;">Errore: ' + e.message + "</p>";
      App.toast("Errore: " + e.message, "error");
    }
  },

  showDuplicateWarning(dup) {
    const area = document.getElementById("duplicate-modal-area");
    area.style.display = "block";
    area.innerHTML = '<div class="card" style="border:2px solid var(--warning);"><div class="card-title" style="color:var(--warning);">Duplicato Rilevato</div><p style="font-size:13px;margin-bottom:8px;">Bolla <strong>' + dup.numero_bolla + '</strong> articolo <strong>' + (dup.codice_articolo || "") + '</strong> esiste già:</p><div class="duplicate-info"><strong>Esistente:</strong> ' + (dup.tipo === "ENTRATA" ? "Entrata" : "Uscita") + " | Data: " + App.formatDate(dup.data_documento) + " | Colli: " + (dup.colli || 0) + " | Peso: " + App.formatNumber(dup.peso_totale) + '</div><div class="btn-group"><button class="btn btn-warning" onclick="Ingresso.duplicateAction(\'update\')">Aggiorna (sovrascrivi)</button><button class="btn btn-outline" onclick="Ingresso.duplicateAction(\'new\')">Nuovo (crea duplicato)</button><button class="btn btn-outline" onclick="Ingresso.resetForm()">Annulla</button></div></div>';
  },

  duplicateAction(action) {
    document.getElementById("duplicate-modal-area").style.display = "none";
    if (action === "update") document.getElementById("btn-save-bolla").textContent = "Aggiorna Documento Esistente";
  },

  showForm(data) {
    document.getElementById("ocr-result").style.display = "block";
    document.getElementById("form-manuale").style.display = "block";

    // Save original values for change detection
    this.ocrOrigValues = {};

    const sv = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val != null) el.value = val;
      this.ocrOrigValues[id] = el.value;
      el.addEventListener("input", () => this.marcaModifica(el, id));
    };

    if (data.tipo) sv("f-tipo", data.tipo);
    if (data.data_documento) {
      const p = data.data_documento.split("/");
      if (p.length === 3) sv("f-data_documento", p[2] + "-" + p[1].padStart(2, "0") + "-" + p[0].padStart(2, "0"));
      else sv("f-data_documento", data.data_documento);
    }
    if (data.data_carico) {
      const p = data.data_carico.split("/");
      if (p.length === 3) sv("f-data_carico", p[2] + "-" + p[1].padStart(2, "0") + "-" + p[0].padStart(2, "0"));
      else sv("f-data_carico", data.data_carico);
    }

    sv("f-numero_bolla", data.numero_bolla);
    sv("f-numero_documento", data.numero_documento);
    sv("f-numero_ordine", data.numero_ordine);
    sv("f-numero_packing_list", data.numero_packing_list);
    sv("f-picking", data.picking);
    sv("f-codice_articolo", data.codice_articolo);
    sv("f-descrizione_articolo", data.descrizione_articolo);
    sv("f-quantita", data.quantita);
    sv("f-colli", data.colli);
    sv("f-peso_totale", data.peso_totale);
    sv("f-pallet", data.pallet);
    sv("f-causale_trasporto", data.causale_trasporto);

    this.renderDettaglio(data.dettaglio || []);
    this.highlightMissing();

    document.getElementById("f-quantita").addEventListener("input", () => {
      const q = parseFloat(document.getElementById("f-quantita").value);
      const peso = document.getElementById("f-peso_totale");
      if (!peso.value || parseFloat(peso.value) === 0) peso.value = q || "";
    });

    const btn = document.getElementById("btn-save-bolla");
    btn.replaceWith(btn.cloneNode(true));
    document.getElementById("btn-save-bolla").addEventListener("click", () => this.saveBolla());
  },

  marcaModifica(el, id) {
    const orig = this.ocrOrigValues[id];
    const curr = el.value;
    const changed = orig !== undefined && curr !== orig;
    el.classList.toggle("field-modified", changed);
  },

  renderDettaglio(items) {
    const tbody = document.getElementById("dettaglio-body");
    if (!tbody) return;
    if (!items || items.length === 0) {
      items = [{ partita_lotto: "", numero_rotelle: 0, peso: 0 }];
    }
    tbody.innerHTML = items.map((d, i) =>
      "<tr>" +
        "<td><input type='text' class='dt-partita' value='" + (d.partita_lotto || "") + "' placeholder='Partita/Lotto' style='width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><input type='number' class='dt-rotelle' value='" + (d.numero_rotelle || 0) + "' step='1' style='width:70px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><input type='number' class='dt-peso' value='" + (d.peso || 0) + "' step='0.001' style='width:90px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
        "<td><button class='btn btn-sm btn-outline' style='padding:2px 8px;font-size:11px;color:var(--danger);border-color:var(--danger);' onclick='Ingresso.rimuoviRigaDettaglio(this)'>×</button></td>" +
      "</tr>"
    ).join("");
  },

  aggiungiRigaDettaglio() {
    const tbody = document.getElementById("dettaglio-body");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td><input type='text' class='dt-partita' value='' placeholder='Partita/Lotto' style='width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><input type='number' class='dt-rotelle' value='0' step='1' style='width:70px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><input type='number' class='dt-peso' value='0' step='0.001' style='width:90px;padding:4px 6px;font-size:12px;border:1px solid var(--gray-300);border-radius:4px;'></td>" +
      "<td><button class='btn btn-sm btn-outline' style='padding:2px 8px;font-size:11px;color:var(--danger);border-color:var(--danger);' onclick='Ingresso.rimuoviRigaDettaglio(this)'>×</button></td>";
    tbody.appendChild(tr);
  },

  rimuoviRigaDettaglio(btn) {
    const tr = btn.closest("tr");
    if (tr && document.querySelectorAll("#dettaglio-body tr").length > 1) {
      tr.remove();
    } else {
      App.toast("Deve esserci almeno una riga", "warning");
    }
  },

  getDettaglioFromForm() {
    const rows = document.querySelectorAll("#dettaglio-body tr");
    const result = [];
    rows.forEach((tr) => {
      const partita = tr.querySelector(".dt-partita")?.value?.trim() || "";
      const rotelle = parseInt(tr.querySelector(".dt-rotelle")?.value) || 0;
      const peso = parseFloat(tr.querySelector(".dt-peso")?.value) || 0;
      if (partita || rotelle || peso) {
        result.push({ partita_lotto: partita, numero_rotelle: rotelle, peso });
      }
    });
    return result;
  },

  highlightMissing() {
    ["f-numero_bolla", "f-data_documento", "f-codice_articolo", "f-descrizione_articolo", "f-quantita"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("field-missing", !el.value.trim());
    });
  },

  async saveBolla() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

    const data = {
      tipo: g("f-tipo"), numero_bolla: g("f-numero_bolla"),
      numero_documento: g("f-numero_documento"), numero_ordine: g("f-numero_ordine"),
      numero_packing_list: g("f-numero_packing_list"),
      picking: g("f-picking") || null,
      data_documento: g("f-data_documento"), data_carico: g("f-data_carico"),
      codice_articolo: g("f-codice_articolo"), descrizione_articolo: g("f-descrizione_articolo"),
      um: g("f-um"), quantita: parseFloat(g("f-quantita")) || 0,
      colli: parseInt(g("f-colli")) || 0, peso_totale: parseFloat(g("f-peso_totale")) || 0,
      pallet: parseInt(g("f-pallet")) || 0,
      causale_trasporto: g("f-causale_trasporto") || null,
      note: g("f-note"), ocr_raw_text: this.ocrData?.ocr_raw_text || null,
      dettaglio: this.getDettaglioFromForm(),
    };

    this.highlightMissing();
    let missing = false;
    ["f-numero_bolla", "f-data_documento", "f-codice_articolo", "f-descrizione_articolo", "f-quantita"].forEach((id) => {
      if (!document.getElementById(id).value.trim()) missing = true;
    });
    if (missing) { App.toast("Completa i campi obbligatori evidenziati", "error"); return; }

    const btn = document.getElementById("btn-save-bolla");
    btn.disabled = true; btn.textContent = "Salvataggio...";
    try {
      const res = await App.api("/documenti/save", { method: "POST", body: JSON.stringify(data) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      App.toast(result.message, "success");
      this.resetForm();
      App.navigate("dashboard");
    } catch (e) { App.toast("Errore: " + e.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "Salva Bolla"; }
  },

  resetForm() {
    document.getElementById("ocr-result").style.display = "none";
    document.getElementById("form-manuale").style.display = "none";
    document.getElementById("duplicate-modal-area").style.display = "none";
    const st = document.getElementById("upload-status");
    st.style.display = "none"; st.innerHTML = "";
    document.getElementById("pdf-input").value = "";
    this.ocrData = null; this.uploadedFile = null; this.duplicateDoc = null; this.ocrOrigValues = {};
  },
};