const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Excel = require("exceljs");
const path = require("path");
const fs = require("fs");

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

router.post("/import-excel", auth, async (req, res) => {
  try {
    const upload = req.app.locals.upload;
    upload.single("file")(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "Nessun file Excel caricato" });
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== ".xlsx" && ext !== ".xls") {
        return res.status(400).json({ error: "Il file deve essere un Excel (.xlsx)" });
      }

      try {
        const supabase = req.app.locals.supabase;
        const wb = new Excel.Workbook();
        await wb.xlsx.readFile(req.file.path);
        const ws = wb.worksheets[0];
        const risultati = { processati: 0, errori: [], aggiornati: [] };

        for (let i = 2; i <= ws.rowCount; i++) {
          const row = ws.getRow(i);
          const codArt = String(row.getCell(1).value || "").trim();
          const descr = String(row.getCell(2).value || "").trim();
          const qty = parseFloat(row.getCell(3).value) || 0;
          const colli = parseInt(row.getCell(4).value) || 0;
          const pallet = parseInt(row.getCell(5).value) || 0;

          if (!codArt || qty <= 0) continue;

          const { data: existing } = await supabase
            .from("giacenze")
            .select("*")
            .eq("codice_articolo", codArt)
            .maybeSingle();

          if (existing) {
            await supabase.from("giacenze").update({
              peso_totale: qty,
              colli_totali: colli || existing.colli_totali,
              pallet_totali: pallet || existing.pallet_totali,
              descrizione_articolo: descr || existing.descrizione_articolo,
              ultimo_aggiornamento: new Date().toISOString(),
            }).eq("id", existing.id);
          } else {
            await supabase.from("giacenze").insert({
              codice_articolo: codArt,
              descrizione_articolo: descr || "N/A",
              peso_totale: qty,
              colli_totali: colli,
              pallet_totali: pallet,
            });
          }
          risultati.processati++;
          risultati.aggiornati.push({ codice_articolo: codArt, kg: qty, colli });
        }

        try { fs.unlinkSync(req.file.path); } catch (e) {}

        res.json({
          message: `Import completato: ${risultati.processati} articoli elaborati`,
          dettaglio: risultati,
        });
      } catch (e) {
        res.status(500).json({ error: "Errore lettura Excel: " + e.message });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
