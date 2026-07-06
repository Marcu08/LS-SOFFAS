const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Excel = require("exceljs");
const path = require("path");
const fs = require("fs");

function normalizzaNumeroIt(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?$/.test(s) || /^\d+[.,]\d+$/.test(s)) {
    s = s.replace(/[.]/g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

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
    const totPallet = giacenze ? giacenze.reduce((s, g) => s + (g.pallet_totali || 0), 0) : 0;

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
      totale_pallet: totPallet,
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

        const mesi = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
        const meseCorrente = mesi[new Date().getMonth()];

        let ws = wb.worksheets[0];
        for (const sheet of wb.worksheets) {
          const b1 = String(sheet.getCell("B1").value || "").trim();
          const b18 = String(sheet.getCell("B18").value || "").trim();
          const d18 = String(sheet.getCell("D18").value || "").trim();
          const isSoffassSheet = b1 === "Pallet Entrati" || (b18 === "ENTRATI" && d18 === "USCITI");
          if (isSoffassSheet) {
            ws = sheet;
            if (sheet.name.trim().toUpperCase() === meseCorrente) break;
          }
        }

        const cellB1 = String(ws.getCell("B1").value || "").trim();
        const cellB18 = String(ws.getCell("B18").value || "").trim();
        const cellD18 = String(ws.getCell("D18").value || "").trim();

        const isSoffass = cellB1 === "Pallet Entrati" || (cellB18 === "ENTRATI" && cellD18 === "USCITI");

        if (isSoffass) {
          return await importaSoffass(supabase, ws, req, res);
        }

        const risultati = { processati: 0, errori: [], aggiornati: [] };
        const dataImport = new Date().toISOString().split("T")[0];

        for (let i = 2; i <= ws.rowCount; i++) {
          const row = ws.getRow(i);
          const codArtRaw = String(row.getCell(1).value || "").trim();
          const codArt = normalizzaNumeroIt(codArtRaw) ? String(Math.round(normalizzaNumeroIt(codArtRaw))) : codArtRaw;
          const descr = String(row.getCell(2).value || "").trim();
          const qty = normalizzaNumeroIt(row.getCell(3).value) || 0;
          const colli = parseInt(normalizzaNumeroIt(row.getCell(4).value)) || 0;
          const pallet = parseInt(normalizzaNumeroIt(row.getCell(5).value)) || 0;

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

          await supabase.from("movimenti").insert([{
            tipo: "ENTRATA",
            codice_articolo: codArt,
            descrizione_articolo: descr || "N/A",
            colli, peso: qty, pallet,
            data_movimento: dataImport,
            numero_bolla: "PAREGGIO-" + dataImport + "-" + codArt,
          }]);

          await req.app.locals.supabaseAdmin.from("event_log").insert([{
            evento: "stock_adjustment",
            dettaglio: { codice_articolo: codArt, peso_kg: qty, colli, pallet, origine: "import_excel" },
          }]);

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

async function importaSoffass(supabase, ws, req, res) {
  const movimenti = [];
  const errori = [];
  let righeValide = 0;
  let righeSaltate = 0;

  const cellD3 = ws.getCell("D3").value;
  const palletInDeposito = parseInt(cellD3) || 0;
  const cellF3 = ws.getCell("F3").value;
  const prezzoMQ = parseFloat(cellF3) || 0;
  const cellG3 = ws.getCell("G3").value;
  const depositoMQ = parseFloat(cellG3) || 0;

  if (palletInDeposito > 0) {
    const { data: existing } = await supabase
      .from("giacenze")
      .select("*")
      .eq("codice_articolo", "PALLET")
      .maybeSingle();

    if (existing) {
      await supabase.from("giacenze").update({
        pallet_totali: palletInDeposito,
        descrizione_articolo: "Pallet in deposito",
        ultimo_aggiornamento: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("giacenze").insert([{
        codice_articolo: "PALLET",
        descrizione_articolo: "Pallet in deposito",
        colli_totali: 0,
        peso_totale: 0,
        pallet_totali: palletInDeposito,
      }]);
    }
  }

  const { data: existingMovs } = await supabase
    .from("movimenti")
    .select("tipo, pallet, data_movimento")
    .ilike("numero_bolla", "SOFFASS-%");

  const existingKeys = new Set();
  if (existingMovs) {
    for (const m of existingMovs) {
      existingKeys.add(`${m.tipo}|${m.data_movimento}|${m.pallet}`);
    }
  }

  for (let i = 19; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);

    if (!row.getCell(2).value && !row.getCell(3).value && !row.getCell(4).value && !row.getCell(5).value) continue;

    const parseDate = (v) => {
      if (!v) return null;
      if (typeof v === "object" && v instanceof Date) return v.toISOString().split("T")[0];
      if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
      return String(v);
    };

    const entrata = { data: parseDate(row.getCell(2).value), qty: parseInt(row.getCell(3).value) || 0, tipo: "ENTRATA" };
    const uscita = { data: parseDate(row.getCell(4).value), qty: parseInt(row.getCell(5).value) || 0, tipo: "USCITA" };

    for (const m of [entrata, uscita]) {
      if (!m.data || m.qty <= 0) continue;
      const key = `${m.tipo}|${m.data}|${m.qty}`;
      if (existingKeys.has(key)) {
        righeSaltate++;
        continue;
      }
      const { error } = await supabase.from("movimenti").insert([{
        tipo: m.tipo,
        codice_articolo: "PALLET",
        descrizione_articolo: m.tipo === "ENTRATA" ? "Entrata pallet in magazzino" : "Uscita pallet da magazzino",
        colli: 0,
        peso: 0,
        pallet: m.qty,
        data_movimento: m.data,
        numero_bolla: "SOFFASS-" + m.data,
      }]);
      if (error) {
        errori.push({ riga: i, errore: error.message });
      } else {
        existingKeys.add(key);
        righeValide++;
        movimenti.push({ data: m.data, pallet: m.qty, tipo: m.tipo });
      }
    }
  }

  try { fs.unlinkSync(req.file.path); } catch (e) {}

  let message = `Import SOFFASS completato: ${righeValide} movimenti importati (${righeSaltate} duplicati saltati)`;
  if (palletInDeposito > 0) message += ` | Pallet in deposito: ${palletInDeposito}`;
  if (errori.length > 0) message += ` | Errori: ${errori.length}`;

  res.json({
    message,
    tipo: "soffass",
    dettaglio: {
      movimenti,
      errori,
      riepilogo: {
        pallet_in_deposito: palletInDeposito,
        prezzo_mq: prezzoMQ,
        deposito_mq: depositoMQ,
      },
    },
  });
}

module.exports = router;
