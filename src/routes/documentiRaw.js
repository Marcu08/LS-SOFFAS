const express = require("express");
const router = express.Router();
const path = require("path");
const auth = require("../middleware/auth");
const { supabaseAdmin } = require("../db/supabase");
const ocrService = require("../services/ocrService");
const DocumentStateService = require("../services/documentStateService");
const SanitizationService = require("../services/sanitizationService");
const ValidationService = require("../services/validationService");
const DuplicateService = require("../services/duplicateService");
const PdfService = require("../services/pdfService");

router.post("/upload", auth, async (req, res) => {
  try {
    const upload = req.app.locals.upload;
    upload.single("pdf")(req, res, async (err) => {
      if (err) return res.status(400).json({ error: "Errore upload: " + err.message });
      if (!req.file) return res.status(400).json({ error: "Nessun file PDF caricato" });
      if (path.extname(req.file.originalname).toLowerCase() !== ".pdf") {
        return res.status(400).json({ error: "Il file deve essere un PDF" });
      }

      const { data: raw, error: insertErr } = await supabaseAdmin
        .from("documenti_raw")
        .insert([{
          pdf_path: req.file.path,
          stato: "uploaded",
          created_by: req.user.id,
        }])
        .select()
        .single();

      if (insertErr) return res.status(500).json({ error: "Errore creazione documento: " + insertErr.message });

      await supabaseAdmin.from("event_log").insert([{
        documento_id: raw.id,
        evento: "upload",
        dettaglio: { file_name: req.file.originalname, file_size: req.file.size },
        created_by: req.user.id,
      }]);

      res.json({ message: "PDF caricato", raw_id: raw.id, stato: raw.stato });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/raw/:id/process", auth, async (req, res) => {
  try {
    const { id } = req.params;

    await DocumentStateService.transition({ id, action: "process", userId: req.user?.id });

    const { data: raw } = await supabaseAdmin
      .from("documenti_raw")
      .select("pdf_path")
      .eq("id", id)
      .single();

    if (!raw) return res.status(404).json({ error: "Documento non trovato" });

    let ocrRaw, sanitized, validation, duplicateCheck;

    try {
      ocrRaw = await ocrService.processDocument(raw.pdf_path);
    } catch (ocrErr) {
      await DocumentStateService.transition({
        id, action: "fail", userId: req.user?.id, meta: { error: ocrErr.message },
      });
      return res.status(422).json({ error: "OCR fallito", message: ocrErr.message });
    }

    const confidence = ocrRaw.ocr_results?.[0]?.confidence || 0;

    sanitized = SanitizationService.applicaAll(ocrRaw);

    validation = ValidationService.validate(sanitized, { confidence });

    duplicateCheck = await DuplicateService.check(sanitized);

    const warnings = [];
    if (validation.warnings) warnings.push(...validation.warnings);
    if (duplicateCheck.duplicate) {
      warnings.push(`Duplicato: bolla #${sanitized.numero_bolla} già presente (${duplicateCheck.scenario})`);
    }

    const nextState = validation.needsReview || duplicateCheck.duplicate ? "needs_review" : "ready_to_confirm";
    if (validation.needsReview || duplicateCheck.duplicate) {
      await DocumentStateService.transition({ id, action: "review", userId: req.user?.id, meta: { warnings, confidence } });
    } else {
      await DocumentStateService.transition({ id, action: "confirm_ready", userId: req.user?.id, meta: { confidence } });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({
        ocr_raw_text: sanitized.ocr_raw_text,
        ocr_confidence: confidence,
        dati_estratti: sanitized,
        stato: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) {
      await DocumentStateService.transition({ id, action: "fail", userId: req.user?.id, meta: { error: updateErr.message } });
      return res.status(500).json({ error: "Errore salvataggio OCR: " + updateErr.message });
    }

    res.json({
      message: "OCR completato",
      raw_id: id,
      stato: nextState,
      data: sanitized,
      validation,
      duplicate: duplicateCheck,
      warnings,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/raw/:id/status", auth, async (req, res) => {
  try {
    const data = await DocumentStateService.getStatus(req.params.id);
    data.events = await DocumentStateService.getEvents(req.params.id);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/raw/:id", auth, async (req, res) => {
  try {
    const data = await DocumentStateService.getStatus(req.params.id);
    const events = await DocumentStateService.getEvents(req.params.id);

    if (data.stato === "extracted" || data.stato === "needs_review" || data.stato === "ready_to_confirm") {
      const duplicate = await DuplicateService.check(data.dati_estratti || {});
      const validation = data.dati_estratti
        ? ValidationService.validate(data.dati_estratti, { confidence: data.ocr_confidence })
        : { valid: true, errors: [], warnings: [] };

      res.json({ ...data, events, validation, duplicate });
    } else {
      res.json({ ...data, events });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/raw/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: raw } = await supabaseAdmin
      .from("documenti_raw")
      .select("id, stato, dati_estratti")
      .eq("id", id)
      .single();

    if (!raw) return res.status(404).json({ error: "Documento non trovato" });
    if (raw.stato !== "extracted" && raw.stato !== "needs_review" && raw.stato !== "ready_to_confirm") {
      return res.status(400).json({ error: "Documento non modificabile nello stato " + raw.stato });
    }

    const merged = { ...(raw.dati_estratti || {}), ...updates };
    const sanitized = SanitizationService.applicaAll(merged);
    const validation = ValidationService.validate(sanitized, { confidence: raw.ocr_confidence });

    const nextState = validation.needsReview ? "needs_review" : "ready_to_confirm";

    await DocumentStateService.transition({
      id, action: "save_review", userId: req.user?.id, meta: { fields_changed: Object.keys(updates) },
    });

    const { error: updateErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({
        dati_estratti: sanitized,
        stato: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) return res.status(500).json({ error: "Errore salvataggio: " + updateErr.message });

    res.json({ message: "Dati aggiornati", stato: nextState, data: sanitized, validation });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/raw/:id/confirm", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: raw, error: fetchErr } = await supabaseAdmin
      .from("documenti_raw")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !raw) return res.status(404).json({ error: "Documento non trovato" });
    if (raw.stato !== "ready_to_confirm") {
      return res.status(400).json({ error: "Documento non pronto per la conferma (stato: " + raw.stato + ")" });
    }

    const data = raw.dati_estratti;
    if (!data) return res.status(400).json({ error: "Nessun dato estratto" });

    const picking = data.picking || data.numero_ordine || null;

    const docData = {
      tipo: data.tipo, numero_bolla: data.numero_bolla,
      numero_documento: data.numero_documento || null,
      numero_ordine: data.numero_ordine || null,
      numero_packing_list: data.numero_packing_list || null,
      picking: picking,
      data_documento: data.data_documento,
      data_carico: data.data_carico || null,
      causale_trasporto: data.causale_trasporto || null,
      mittente: data.mittente || null,
      destinatario: data.destinatario || null,
      codice_articolo: data.codice_articolo,
      descrizione_articolo: data.descrizione_articolo,
      um: data.um || "KG", quantita: data.quantita || 0,
      colli: data.colli || 0, peso_totale: data.peso_totale || data.quantita || 0,
      pallet: data.pallet || 0, note: data.note || null,
      ocr_raw_text: raw.ocr_raw_text || null,
      stato: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: req.user.id,
      raw_document_id: id,
      created_by: req.user.id,
    };

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documenti")
      .insert([{ ...docData, created_at: new Date().toISOString() }])
      .select()
      .single();

    if (docErr) return res.status(500).json({ error: "Errore creazione documento: " + docErr.message });

    const movErr = await creaMovimento(supabaseAdmin, doc, picking);
    if (movErr) {
      await supabaseAdmin.from("documenti").delete().eq("id", doc.id);
      return res.status(500).json({ error: "Errore creazione movimento: " + movErr.message });
    }

    const giacErr = await aggiornaGiacenze(supabaseAdmin, doc, picking);
    if (giacErr) {
      await supabaseAdmin.from("movimenti").delete().eq("documento_id", doc.id);
      await supabaseAdmin.from("documenti").delete().eq("id", doc.id);
      return res.status(500).json({ error: "Errore aggiornamento giacenze: " + giacErr.message });
    }

    const dettaglio = data.dettaglio || [];
    if (dettaglio.length > 0) {
      const dd = dettaglio.map((d, i) => ({
        documento_id: doc.id, partita_lotto: d.partita_lotto || null,
        numero_rotelle: d.numero_rotelle || 0, peso: d.peso || 0, posizione: i + 1,
      }));
      const { error: detErr } = await supabaseAdmin.from("dettaglio_documenti").insert(dd);
      if (detErr) {
        await supabaseAdmin.from("dettaglio_documenti").delete().eq("documento_id", doc.id);
        await supabaseAdmin.from("movimenti").delete().eq("documento_id", doc.id);
        await supabaseAdmin.from("documenti").delete().eq("id", doc.id);
        return res.status(500).json({ error: "Errore salvataggio dettaglio: " + detErr.message });
      }
    }

    await DocumentStateService.transition({
      id, action: "confirm", userId: req.user?.id, meta: { documento_id: doc.id },
    });

    const { error: rawUpdateErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({ stato: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (rawUpdateErr) console.error("Errore aggiornamento raw dopo confirmed:", rawUpdateErr.message);

    res.json({ message: "Documento confermato", documento: doc, raw_id: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/raw/:id/retry", auth, async (req, res) => {
  try {
    const { id } = req.params;

    await DocumentStateService.transition({ id, action: "retry", userId: req.user?.id });

    const { error: resetErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({
        stato: "uploaded",
        ocr_raw_text: null,
        ocr_confidence: null,
        dati_estratti: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (resetErr) return res.status(500).json({ error: "Errore reset: " + resetErr.message });

    res.json({ message: "Documento resettato, pronto per nuovo tentativo", raw_id: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/raw/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: raw } = await supabaseAdmin
      .from("documenti_raw")
      .select("pdf_path")
      .eq("id", id)
      .single();

    if (!raw) return res.status(404).json({ error: "Documento non trovato" });

    await supabaseAdmin.from("event_log").delete().eq("documento_id", id);
    await supabaseAdmin.from("documenti_raw").delete().eq("id", id);

    if (raw.pdf_path) {
      try { require("fs").unlinkSync(raw.pdf_path); } catch (e) {}
    }

    res.json({ message: "Documento eliminato" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/raw", auth, async (req, res) => {
  try {
    const { stato, page = 1, limit = 50 } = req.query;
    let q = supabaseAdmin
      .from("documenti_raw")
      .select("*", { count: "exact" });

    if (stato) q = q.eq("stato", stato);

    const fromRow = (page - 1) * limit;
    q = q.range(fromRow, fromRow + limit - 1).order("created_at", { ascending: false });

    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });

    res.json({ documenti: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function creaMovimento(supabase, doc, picking) {
  const pKey = picking || doc.picking || null;
  const { error } = await supabase.from("movimenti").insert([{
    documento_id: doc.id, tipo: doc.tipo, codice_articolo: doc.codice_articolo,
    descrizione_articolo: doc.descrizione_articolo, colli: doc.colli || 0,
    peso: doc.peso_totale || doc.quantita || 0, pallet: doc.pallet || 0,
    data_movimento: doc.data_documento, numero_bolla: doc.numero_bolla,
    picking: pKey,
  }]);
  return error;
}

async function aggiornaGiacenze(supabase, doc, picking) {
  const colli = doc.colli || 0;
  const peso = parseFloat(doc.peso_totale || doc.quantita || 0);
  const pallet = doc.pallet || 0;
  const pKey = picking || doc.picking || null;

  let q = supabase.from("giacenze").select("*").eq("codice_articolo", doc.codice_articolo);
  if (pKey) { q = q.eq("picking", pKey); } else { q = q.is("picking", null); }
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const nc = doc.tipo === "ENTRATA" ? existing.colli_totali + colli : Math.max(0, existing.colli_totali - colli);
    const np = doc.tipo === "ENTRATA" ? parseFloat(existing.peso_totale) + peso : Math.max(0, parseFloat(existing.peso_totale) - peso);
    const npa = doc.tipo === "ENTRATA" ? existing.pallet_totali + pallet : Math.max(0, existing.pallet_totali - pallet);
    const { error } = await supabase.from("giacenze").update({
      colli_totali: nc, peso_totale: Math.round(np * 1000) / 1000, pallet_totali: npa,
      ultimo_aggiornamento: new Date().toISOString()
    }).eq("id", existing.id);
    return error;
  }

  const { error } = await supabase.from("giacenze").insert([{
    codice_articolo: doc.codice_articolo, descrizione_articolo: doc.descrizione_articolo,
    picking: pKey,
    colli_totali: doc.tipo === "ENTRATA" ? colli : 0,
    peso_totale: doc.tipo === "ENTRATA" ? peso : 0,
    pallet_totali: doc.tipo === "ENTRATA" ? pallet : 0,
  }]);
  return error;
}

module.exports = router;
