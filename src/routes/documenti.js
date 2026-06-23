const express = require("express");
const router = express.Router();
const path = require("path");
const auth = require("../middleware/auth");
const ocrService = require("../services/ocrService");

router.post("/upload", auth, async (req, res) => {
  try {
    const upload = req.app.locals.upload;
    upload.single("pdf")(req, res, async (err) => {
      if (err) return res.status(400).json({ error: "Errore upload: " + err.message });
      if (!req.file) return res.status(400).json({ error: "Nessun file PDF caricato" });
      if (path.extname(req.file.originalname).toLowerCase() !== ".pdf") {
        return res.status(400).json({ error: "Il file deve essere un PDF" });
      }
      const pdfPath = req.file.path;
      try {
        const ocrData = await ocrService.processDocument(pdfPath);
        const supabase = req.app.locals.supabase;
        let duplicate = null;
        if (ocrData.numero_bolla && ocrData.picking) {
          const { data: dup } = await supabase
            .from("documenti")
            .select("id, numero_bolla, tipo, data_documento, descrizione_articolo, colli, peso_totale, created_at")
            .eq("picking", ocrData.picking)
            .eq("numero_bolla", ocrData.numero_bolla)
            .maybeSingle();
          duplicate = dup;
        }
        res.json({ message: duplicate ? "OCR completato - Duplicato trovato" : "OCR completato", file: req.file.filename, data: ocrData, duplicate });
      } catch (ocrErr) {
        res.json({ message: "PDF caricato, OCR fallito", file: req.file.filename, data: { ocr_raw_text: "", error: ocrErr.message, dettaglio: [] }, ocr_error: ocrErr.message });
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/upload-batch", auth, async (req, res) => {
  try {
    const upload = req.app.locals.upload;
    upload.array("pdfs")(req, res, async (err) => {
      if (err) return res.status(400).json({ error: "Errore upload: " + err.message });
      if (!req.files || req.files.length === 0) return res.status(400).json({ error: "Nessun file PDF caricato" });

      for (const f of req.files) {
        if (path.extname(f.originalname).toLowerCase() !== ".pdf") {
          return res.status(400).json({ error: "Tutti i file devono essere PDF: " + f.originalname });
        }
      }

      const results = await Promise.allSettled(
        req.files.map(async (file) => {
          const ocrData = await ocrService.processDocument(file.path);
          const supabase = req.app.locals.supabase;
          let duplicate = null;
          if (ocrData.numero_bolla && ocrData.picking) {
            const { data: dup } = await supabase
              .from("documenti")
              .select("id, numero_bolla, tipo, data_documento, descrizione_articolo, colli, peso_totale, created_at")
              .eq("picking", ocrData.picking)
              .eq("numero_bolla", ocrData.numero_bolla)
              .maybeSingle();
            duplicate = dup;
          }
          return { file: file.filename, data: ocrData, duplicate };
        })
      );

      const mapped = results.map((r, i) => ({
        file: req.files[i].filename,
        status: r.status === "fulfilled" ? "ok" : "error",
        ...(r.status === "fulfilled" ? r.value : { error: r.reason.message }),
      }));

      res.json({ message: "Batch completato", results: mapped });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Salvataggio documento (con rollback manuale) ──────────────────────────
//
// NOTA: Per vera atomicità andrebbe creata una funzione RPC su Supabase
// (CREATE OR REPLACE FUNCTION) che esegua tutte le operazioni in una singola
// transazione SQL con BEGIN/COMMIT. Il client JavaScript con chiave anonima
// non può invocare funzioni RPC custom, quindi qui si simula l'atomicità con
// rollback manuale.
//
// La funzione RPC dovrebbe ricevere tutti i dati del documento + dettaglio,
// fare INSERT/UPDATE su documenti, movimenti, giacenze (per picking +
// codice_articolo) e dettaglio_documenti, e restituire il documento salvato.

router.post("/save", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const doc = req.body;
    const required = ["numero_bolla", "data_documento", "codice_articolo", "descrizione_articolo", "tipo"];
    for (const f of required) { if (!doc[f]) return res.status(400).json({ error: "Campo obbligatorio: " + f }); }

    const picking = doc.picking || doc.numero_ordine || null;

    const { data: existing } = await supabase
      .from("documenti")
      .select("id, numero_bolla, tipo, colli, peso_totale, pallet")
      .eq("picking", picking)
      .eq("numero_bolla", doc.numero_bolla)
      .maybeSingle();

    const docData = {
      tipo: doc.tipo, numero_bolla: doc.numero_bolla,
      numero_documento: doc.numero_documento || null,
      numero_ordine: doc.numero_ordine || null,
      numero_packing_list: doc.numero_packing_list || null,
      picking: picking,
      data_documento: doc.data_documento,
      data_carico: doc.data_carico || null,
      causale_trasporto: doc.causale_trasporto || null,
      codice_articolo: doc.codice_articolo,
      descrizione_articolo: doc.descrizione_articolo,
      um: doc.um || "KG", quantita: doc.quantita || 0,
      colli: doc.colli || 0, peso_totale: doc.peso_totale || doc.quantita || 0,
      pallet: doc.pallet || 0, note: doc.note || null,
      ocr_raw_text: doc.ocr_raw_text || null,
      created_by: req.user.id, updated_at: new Date().toISOString(),
    };

    let result, isUpdate;
    let oldData = null;

    if (existing) {
      oldData = { ...existing };
      const { data, error } = await supabase.from("documenti").update(docData).eq("id", existing.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      result = data; isUpdate = true;

      const { error: delMovErr } = await supabase.from("movimenti").delete().eq("documento_id", existing.id);
      if (delMovErr) {
        await supabase.from("documenti").update({
          tipo: oldData.tipo, colli: oldData.colli, peso_totale: oldData.peso_totale, pallet: oldData.pallet
        }).eq("id", existing.id);
        return res.status(500).json({ error: "Errore eliminazione movimento: " + delMovErr.message });
      }

      const movErr = await creaMovimento(supabase, result, picking);
      if (movErr) {
        await supabase.from("documenti").update({
          tipo: oldData.tipo, colli: oldData.colli, peso_totale: oldData.peso_totale, pallet: oldData.pallet
        }).eq("id", existing.id);
        return res.status(500).json({ error: "Errore creazione movimento: " + movErr.message });
      }

      const giacErr = await refreshGiacenze(supabase, doc.codice_articolo, doc.descrizione_articolo, picking);
      if (giacErr) {
        await supabase.from("documenti").update({
          tipo: oldData.tipo, colli: oldData.colli, peso_totale: oldData.peso_totale, pallet: oldData.pallet
        }).eq("id", existing.id);
        return res.status(500).json({ error: "Errore aggiornamento giacenze: " + giacErr.message });
      }
    } else {
      const { data, error } = await supabase.from("documenti").insert([{ ...docData, created_at: new Date().toISOString() }]).select().single();
      if (error) return res.status(400).json({ error: error.message });
      result = data; isUpdate = false;

      const movErr = await creaMovimento(supabase, result, picking);
      if (movErr) {
        await supabase.from("documenti").delete().eq("id", result.id);
        return res.status(500).json({ error: "Errore creazione movimento: " + movErr.message });
      }

      const giacErr = await aggiornaGiacenze(supabase, result, picking);
      if (giacErr) {
        await supabase.from("movimenti").delete().eq("documento_id", result.id);
        await supabase.from("documenti").delete().eq("id", result.id);
        return res.status(500).json({ error: "Errore aggiornamento giacenze: " + giacErr.message });
      }
    }

    const dettaglio = doc.dettaglio || [];
    if (dettaglio.length > 0) {
      if (existing) {
        const { error: delDetErr } = await supabase.from("dettaglio_documenti").delete().eq("documento_id", result.id);
        if (delDetErr) {
          await supabase.from("documenti").update({
            tipo: oldData.tipo, colli: oldData.colli, peso_totale: oldData.peso_totale, pallet: oldData.pallet
          }).eq("id", existing.id);
          return res.status(500).json({ error: "Errore eliminazione dettaglio: " + delDetErr.message });
        }
      }

      const dd = dettaglio.map((d, i) => ({
        documento_id: result.id, partita_lotto: d.partita_lotto || null,
        numero_rotelle: d.numero_rotelle || 0, peso: d.peso || 0, posizione: i + 1,
      }));

      const { error: detErr } = await supabase.from("dettaglio_documenti").insert(dd);
      if (detErr) {
        await supabase.from("dettaglio_documenti").delete().eq("documento_id", result.id);
        if (existing) {
          await supabase.from("documenti").update({
            tipo: oldData.tipo, colli: oldData.colli, peso_totale: oldData.peso_totale, pallet: oldData.pallet
          }).eq("id", existing.id);
        } else {
          await supabase.from("movimenti").delete().eq("documento_id", result.id);
          await supabase.from("documenti").delete().eq("id", result.id);
        }
        return res.status(500).json({ error: "Errore salvataggio dettaglio: " + detErr.message });
      }
    }

    res.json({ message: existing ? "Documento aggiornato" : "Documento creato", documento: result, isUpdate });
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
  } else {
    const { error } = await supabase.from("giacenze").insert([{
      codice_articolo: doc.codice_articolo, descrizione_articolo: doc.descrizione_articolo,
      picking: pKey,
      colli_totali: doc.tipo === "ENTRATA" ? colli : 0,
      peso_totale: doc.tipo === "ENTRATA" ? peso : 0,
      pallet_totali: doc.tipo === "ENTRATA" ? pallet : 0,
    }]);
    return error;
  }
}

async function refreshGiacenze(supabase, codArt, descr, picking) {
  let q = supabase.from("documenti").select("tipo, colli, peso_totale, pallet").eq("codice_articolo", codArt);
  if (picking) q = q.eq("picking", picking);
  const { data: docs } = await q;

  let tc = 0, tp = 0, tpa = 0;
  if (docs) docs.forEach((d) => {
    if (d.tipo === "ENTRATA") { tc += d.colli || 0; tp += parseFloat(d.peso_totale || 0); tpa += d.pallet || 0; }
    else { tc -= d.colli || 0; tp -= parseFloat(d.peso_totale || 0); tpa -= d.pallet || 0; }
  });

  let gq = supabase.from("giacenze").select("id").eq("codice_articolo", codArt);
  if (picking) { gq = gq.eq("picking", picking); } else { gq = gq.is("picking", null); }
  const { data: existing } = await gq.maybeSingle();

  if (existing) {
    const { error } = await supabase.from("giacenze").update({
      colli_totali: Math.max(0, tc), peso_totale: Math.max(0, Math.round(tp * 1000) / 1000),
      pallet_totali: Math.max(0, tpa), ultimo_aggiornamento: new Date().toISOString()
    }).eq("id", existing.id);
    return error;
  } else {
    const { error } = await supabase.from("giacenze").insert([{
      codice_articolo: codArt, descrizione_articolo: descr, picking: picking || null,
      colli_totali: Math.max(0, tc), peso_totale: Math.max(0, tp), pallet_totali: Math.max(0, tpa),
    }]);
    return error;
  }
}

router.get("/", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { tipo, from, to, search, page = 1, limit = 50 } = req.query;
    let q = supabase.from("documenti").select("*", { count: "exact" });
    if (tipo) q = q.eq("tipo", tipo);
    if (from) q = q.gte("data_documento", from);
    if (to) q = q.lte("data_documento", to);
    if (search) q = q.or("numero_bolla.ilike.%" + search + "%,codice_articolo.ilike.%" + search + "%,descrizione_articolo.ilike.%" + search + "%");
    const fromRow = (page - 1) * limit;
    q = q.range(fromRow, fromRow + limit - 1).order("created_at", { ascending: false });
    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ documenti: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { data: doc, error } = await supabase.from("documenti").select("*").eq("id", req.params.id).single();
    if (error) return res.status(404).json({ error: "Documento non trovato" });
    const { data: dettaglio } = await supabase.from("dettaglio_documenti").select("*").eq("documento_id", req.params.id).order("posizione");
    res.json({ documento: doc, dettaglio: dettaglio || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const up = req.body; delete up.id; delete up.created_at; up.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("documenti").update(up).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Documento aggiornato", documento: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { data: doc } = await supabase.from("documenti").select("*").eq("id", req.params.id).single();
    if (!doc) return res.status(404).json({ error: "Documento non trovato" });
    await supabase.from("dettaglio_documenti").delete().eq("documento_id", req.params.id);
    await supabase.from("movimenti").delete().eq("documento_id", req.params.id);
    await supabase.from("documenti").delete().eq("id", req.params.id);
    await refreshGiacenze(supabase, doc.codice_articolo, doc.descrizione_articolo, doc.picking);
    res.json({ message: "Documento eliminato" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
