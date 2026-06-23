const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { search, picking } = req.query;
    let query = supabase.from("giacenze").select("*", { count: "exact" });

    if (picking) {
      query = query.eq("picking", picking);
    }

    if (search) {
      query = query.or(
        `codice_articolo.ilike.%${search}%,descrizione_articolo.ilike.%${search}%,picking.ilike.%${search}%`
      );
    }

    query = query.order("codice_articolo");

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ giacenze: data, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/riepilogo", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { data: giacenze } = await supabase.from("giacenze").select("*");
    const { data: ultimiMov } = await supabase
      .from("movimenti")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    const { count: totaleDoc } = await supabase
      .from("documenti")
      .select("*", { count: "exact", head: true });

    const totColli = giacenze ? giacenze.reduce((s, g) => s + (g.colli_totali || 0), 0) : 0;
    const totPeso = giacenze ? giacenze.reduce((s, g) => s + parseFloat(g.peso_totale || 0), 0) : 0;

    const gruppiPicking = {};
    if (giacenze) {
      for (const g of giacenze) {
        const key = g.picking || "N/A";
        if (!gruppiPicking[key]) {
          gruppiPicking[key] = { picking: key, totale_articoli: 0, totale_colli: 0, totale_peso_kg: 0 };
        }
        gruppiPicking[key].totale_articoli += 1;
        gruppiPicking[key].totale_colli += g.colli_totali || 0;
        gruppiPicking[key].totale_peso_kg += parseFloat(g.peso_totale || 0);
      }
    }
    for (const key of Object.keys(gruppiPicking)) {
      gruppiPicking[key].totale_peso_kg = Math.round(gruppiPicking[key].totale_peso_kg * 100) / 100;
    }

    res.json({
      totale_articoli: giacenze ? giacenze.length : 0,
      totale_colli: totColli,
      totale_peso_kg: Math.round(totPeso * 100) / 100,
      totale_documenti: totaleDoc || 0,
      ultimi_movimenti: ultimiMov || [],
        raggruppamento_picking: Object.values(gruppiPicking),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
