const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { creaMovimento, refreshGiacenze } = require("../services/magazzinoService");

const ALLOWED_UPDATE = ["note", "peso_totale", "colli", "pallet", "data_carico", "causale_trasporto", "numero_packing_list"];

router.get("/", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { tipo, from, to, search, page = 1, limit = 50 } = req.query;
    let q = supabase.from("documenti").select("*", { count: "exact" });
    if (tipo) q = q.eq("tipo", tipo);
    if (from) q = q.gte("data_documento", from);
    if (to) q = q.lte("data_documento", to);
    if (search) {
      const s = search.replace(/[%_]/g, "").slice(0, 100);
      q = q.or("numero_bolla.ilike.%" + s + "%,codice_articolo.ilike.%" + s + "%,descrizione_articolo.ilike.%" + s + "%");
    }
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
    const up = {};
    for (const k of ALLOWED_UPDATE) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    if (Object.keys(up).length === 0) return res.status(400).json({ error: "Nessun campo modificabile" });
    up.updated_at = new Date().toISOString();
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
