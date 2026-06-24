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
      if (path.extname(req.file.originalname).toLowerCase() !== ".pdf" || !req.file.mimetype.includes("pdf")) {
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

async function processOcrBackground({ id, pdfPath, userId }) {
  try {
    const ocrRaw = await ocrService.processDocument(pdfPath);

    const confidence = ocrRaw.ocr_results?.[0]?.confidence || 0;
    const sanitized = SanitizationService.applicaAll(ocrRaw);
    const validation = ValidationService.validate(sanitized, { confidence });
    const duplicateCheck = await DuplicateService.check(sanitized);

    const warnings = [];
    if (validation.warnings) warnings.push(...validation.warnings);
    if (duplicateCheck.duplicate) {
      warnings.push(`Duplicato: bolla #${sanitized.numero_bolla} già presente (${duplicateCheck.scenario})`);
    }

    const nextState = validation.needsReview || duplicateCheck.duplicate ? "needs_review" : "ready_to_confirm";

    await DocumentStateService.transition({ id, action: "confirm_ready", userId, meta: { confidence, warnings } });

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
      await DocumentStateService.transition({ id, action: "fail", userId, meta: { error: updateErr.message } });
    }
  } catch (err) {
    console.error("Async OCR error:", err);
    try {
      await DocumentStateService.transition({ id, action: "fail", userId, meta: { error: err.message } });
      await supabaseAdmin.from("documenti_raw").update({
        stato: "error", error_message: err.message, updated_at: new Date().toISOString(),
      }).eq("id", id);
    } catch (e) { console.error("Failed to update error state:", e); }
  }
}

router.post("/raw/:id/process", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: raw } = await supabaseAdmin
      .from("documenti_raw")
      .select("stato, pdf_path")
      .eq("id", id)
      .single();

    if (!raw) return res.status(404).json({ error: "Documento non trovato" });
    if (raw.stato !== "uploaded") return res.status(400).json({ error: "Documento già elaborato o in elaborazione" });

    await DocumentStateService.transition({ id, action: "process", userId: req.user?.id });

    await supabaseAdmin.from("documenti_raw").update({
      stato: "processing", updated_at: new Date().toISOString(),
    }).eq("id", id);

    processOcrBackground({ id, pdfPath: raw.pdf_path, userId: req.user?.id });

    res.json({ message: "Elaborazione avviata", raw_id: id, stato: "processing" });
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

    if (!raw.dati_estratti) return res.status(400).json({ error: "Nessun dato estratto" });

    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("confirm_document", {
      p_raw_id: id,
      p_dati: raw.dati_estratti,
      p_ocr_raw_text: raw.ocr_raw_text,
      p_ocr_confidence: raw.ocr_confidence,
      p_user_id: req.user.id,
    });

    if (rpcErr) return res.status(500).json({ error: "Errore conferma documento: " + rpcErr.message });

    const docId = rpcResult.id;

    await DocumentStateService.transition({
      id, action: "confirm", userId: req.user?.id, meta: { documento_id: docId },
    });

    const { error: rawUpdateErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({ stato: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (rawUpdateErr) console.error("Errore aggiornamento raw dopo confirmed:", rawUpdateErr.message);

    const { data: doc } = await supabaseAdmin.from("documenti").select("*").eq("id", docId).single();

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

module.exports = router;
