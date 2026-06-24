const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ExcelJS = require("exceljs");

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a56db" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const ALT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
const BORDER = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
const NUM_FMT = '#,##0';
const NUM_FMT2 = '#,##0.00';

async function styleSheet(ws, totalsRow) {
  const header = ws.getRow(1);
  header.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = BORDER; });
  header.height = 28;

  const rowCount = ws.rowCount;
  const colCount = ws.columnCount;
  for (let r = 2; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const isTotal = totalsRow && r === rowCount;
    row.eachCell((c, col) => {
      c.border = BORDER;
      c.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
      if (isTotal) { c.font = { bold: true, size: 11, color: { argb: "FF1a56db" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } }; }
      else if (r % 2 === 0) c.fill = ALT_FILL;
    });
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rowCount, column: colCount } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

router.get("/giacenze", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { data: giacenze } = await supabase.from("giacenze").select("*").order("codice_articolo").limit(10000);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Gestionale LS SOFFASS";
    wb.created = new Date();
    const ws = wb.addWorksheet("Giacenze");

    ws.columns = [
      { header: "Codice Articolo", key: "codice_articolo", width: 22 },
      { header: "Descrizione", key: "descrizione_articolo", width: 50 },
      { header: "Colli Totali", key: "colli_totali", width: 15, style: { numFmt: NUM_FMT } },
      { header: "Peso Totale (KG)", key: "peso_totale", width: 20, style: { numFmt: NUM_FMT2 } },
      { header: "Pallet Totali", key: "pallet_totali", width: 16, style: { numFmt: NUM_FMT } },
      { header: "Ultimo Aggiornamento", key: "ultimo_aggiornamento", width: 22 },
    ];

    let totColli = 0, totPeso = 0, totPallet = 0;
    giacenze.forEach((g) => {
      ws.addRow({
        codice_articolo: g.codice_articolo,
        descrizione_articolo: g.descrizione_articolo,
        colli_totali: g.colli_totali || 0,
        peso_totale: parseFloat(g.peso_totale || 0),
        pallet_totali: g.pallet_totali || 0,
        ultimo_aggiornamento: g.ultimo_aggiornamento ? new Date(g.ultimo_aggiornamento).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
      });
      totColli += g.colli_totali || 0; totPeso += parseFloat(g.peso_totale || 0); totPallet += g.pallet_totali || 0;
    });

    ws.addRow({ codice_articolo: "TOTALE", colli_totali: totColli, peso_totale: Math.round(totPeso * 100) / 100, pallet_totali: totPallet });
    await styleSheet(ws, true);
    ws.getCell(ws.rowCount, 1).font = { bold: true, size: 11, color: { argb: "FF1a56db" } };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Giacenze_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/movimenti", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { from, to } = req.query;
    let query = supabase.from("movimenti").select("*").order("data_movimento", { ascending: false });
    if (from) query = query.gte("data_movimento", from);
    if (to) query = query.lte("data_movimento", to);
    const { data: movimenti } = await query.limit(10000);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Gestionale LS SOFFASS";
    wb.created = new Date();
    const ws = wb.addWorksheet("Movimenti");

    ws.columns = [
      { header: "Data", key: "data_movimento", width: 14 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Numero Bolla", key: "numero_bolla", width: 20 },
      { header: "Codice Articolo", key: "codice_articolo", width: 22 },
      { header: "Descrizione", key: "descrizione_articolo", width: 50 },
      { header: "Colli", key: "colli", width: 10, style: { numFmt: NUM_FMT } },
      { header: "Peso (KG)", key: "peso", width: 15, style: { numFmt: NUM_FMT2 } },
      { header: "Pallet", key: "pallet", width: 10, style: { numFmt: NUM_FMT } },
    ];

    let totColli = 0, totPeso = 0, totPallet = 0;
    movimenti.forEach((m) => {
      ws.addRow({
        data_movimento: m.data_movimento,
        tipo: m.tipo === "ENTRATA" ? "ENTRATA" : "USCITA",
        numero_bolla: m.numero_bolla,
        codice_articolo: m.codice_articolo,
        descrizione_articolo: m.descrizione_articolo,
        colli: m.colli || 0,
        peso: parseFloat(m.peso || 0),
        pallet: m.pallet || 0,
      });
      totColli += m.colli || 0; totPeso += parseFloat(m.peso || 0); totPallet += m.pallet || 0;
    });

    ws.addRow({ data_movimento: "TOTALE", colli: totColli, peso: Math.round(totPeso * 100) / 100, pallet: totPallet });
    await styleSheet(ws, true);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Movimenti_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/pallet", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { data: documenti } = await supabase.from("documenti").select("*").order("data_documento").limit(10000);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Gestionale LS SOFFASS";
    wb.created = new Date();

    // Sheet 1: Riepilogo
    const ws = wb.addWorksheet("Riepilogo");
    ws.columns = [
      { header: "Picking", key: "picking", width: 18 },
      { header: "Codice Articolo", key: "codice_articolo", width: 22 },
      { header: "Descrizione", key: "descrizione_articolo", width: 50 },
      { header: "Pallet Entrati", key: "entrati", width: 16, style: { numFmt: NUM_FMT } },
      { header: "Pallet Usciti", key: "usciti", width: 16, style: { numFmt: NUM_FMT } },
      { header: "Pallet In Deposito", key: "deposito", width: 18, style: { numFmt: NUM_FMT } },
      { header: "Colli Entrati", key: "colli_entrati", width: 16, style: { numFmt: NUM_FMT } },
      { header: "Colli Usciti", key: "colli_usciti", width: 16, style: { numFmt: NUM_FMT } },
      { header: "Peso Entrato (KG)", key: "peso_entrato", width: 18, style: { numFmt: NUM_FMT2 } },
      { header: "Peso Uscito (KG)", key: "peso_uscito", width: 18, style: { numFmt: NUM_FMT2 } },
    ];

    const perArt = {};
    documenti.forEach((d) => {
      const key = (d.picking || "N/A") + "|" + d.codice_articolo;
      if (!perArt[key]) perArt[key] = { picking: d.picking || "N/A", codice_articolo: d.codice_articolo, descr: d.descrizione_articolo, entrati: 0, usciti: 0, colli_entrati: 0, colli_usciti: 0, peso_entrato: 0, peso_uscito: 0 };
      if (d.tipo === "ENTRATA") { perArt[key].entrati += d.pallet || 0; perArt[key].colli_entrati += d.colli || 0; perArt[key].peso_entrato += parseFloat(d.peso_totale || d.quantita || 0); }
      else { perArt[key].usciti += d.pallet || 0; perArt[key].colli_usciti += d.colli || 0; perArt[key].peso_uscito += parseFloat(d.peso_totale || d.quantita || 0); }
    });

    let tE = 0, tU = 0, tD = 0, tCE = 0, tCU = 0, tPE = 0, tPU = 0;
    Object.keys(perArt).sort().forEach((key) => {
      const a = perArt[key];
      const deposito = a.entrati - a.usciti;
      ws.addRow({ picking: a.picking, codice_articolo: a.codice_articolo, descrizione_articolo: a.descr, entrati: a.entrati, usciti: a.usciti, deposito: Math.max(0, deposito), colli_entrati: a.colli_entrati, colli_usciti: a.colli_usciti, peso_entrato: Math.round(a.peso_entrato * 100) / 100, peso_uscito: Math.round(a.peso_uscito * 100) / 100 });
      tE += a.entrati; tU += a.usciti; tD += Math.max(0, deposito); tCE += a.colli_entrati; tCU += a.colli_usciti; tPE += a.peso_entrato; tPU += a.peso_uscito;
    });

    ws.addRow({ codice_articolo: "TOTALE", entrati: tE, usciti: tU, deposito: tD, colli_entrati: tCE, colli_usciti: tCU, peso_entrato: Math.round(tPE * 100) / 100, peso_uscito: Math.round(tPU * 100) / 100 });
    await styleSheet(ws, true);

    // Sheet 2: Dettaglio Giornaliero
    const ws2 = wb.addWorksheet("Dettaglio Giornaliero");
    ws2.columns = [
      { header: "Data", key: "data", width: 14 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Bolla", key: "numero_bolla", width: 20 },
      { header: "Articolo", key: "codice_articolo", width: 22 },
      { header: "Descrizione", key: "descrizione_articolo", width: 50 },
      { header: "Colli", key: "colli", width: 10, style: { numFmt: NUM_FMT } },
      { header: "Peso (KG)", key: "peso_totale", width: 15, style: { numFmt: NUM_FMT2 } },
      { header: "Pallet", key: "pallet", width: 10, style: { numFmt: NUM_FMT } },
    ];

    documenti.forEach((d) => {
      ws2.addRow({ data: d.data_documento, tipo: d.tipo, numero_bolla: d.numero_bolla, codice_articolo: d.codice_articolo, descrizione_articolo: d.descrizione_articolo, colli: d.colli || 0, peso_totale: parseFloat(d.peso_totale || d.quantita || 0), pallet: d.pallet || 0 });
    });
    await styleSheet(ws2, false);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Pallet_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/documenti", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const { from, to, tipo } = req.query;
    let query = supabase.from("documenti").select("*").order("data_documento", { ascending: false });
    if (from) query = query.gte("data_documento", from);
    if (to) query = query.lte("data_documento", to);
    if (tipo) query = query.eq("tipo", tipo);
    const { data: documenti } = await query.limit(10000);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Gestionale LS SOFFASS";
    wb.created = new Date();
    const ws = wb.addWorksheet("Documenti");

    ws.columns = [
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Data", key: "data_documento", width: 14 },
      { header: "Numero Bolla", key: "numero_bolla", width: 20 },
      { header: "Numero Documento", key: "numero_documento", width: 18 },
      { header: "Numero Ordine", key: "numero_ordine", width: 18 },
      { header: "Numero Packing List", key: "numero_packing_list", width: 18 },
      { header: "Codice Articolo", key: "codice_articolo", width: 22 },
      { header: "Descrizione", key: "descrizione_articolo", width: 50 },
      { header: "Quantità (KG)", key: "quantita", width: 15, style: { numFmt: NUM_FMT } },
      { header: "Colli", key: "colli", width: 10, style: { numFmt: NUM_FMT } },
      { header: "Peso Totale", key: "peso_totale", width: 15, style: { numFmt: NUM_FMT2 } },
      { header: "Pallet", key: "pallet", width: 10, style: { numFmt: NUM_FMT } },
    ];

    let totQ = 0, totC = 0, totP = 0, totPa = 0;
    documenti.forEach((d) => {
      ws.addRow({
        tipo: d.tipo, data_documento: d.data_documento, numero_bolla: d.numero_bolla, numero_documento: d.numero_documento, numero_ordine: d.numero_ordine, numero_packing_list: d.numero_packing_list, codice_articolo: d.codice_articolo, descrizione_articolo: d.descrizione_articolo, quantita: parseInt(d.quantita || 0), colli: d.colli || 0, peso_totale: parseFloat(d.peso_totale || d.quantita || 0), pallet: d.pallet || 0,
      });
      totQ += parseInt(d.quantita || 0); totC += d.colli || 0; totP += parseFloat(d.peso_totale || d.quantita || 0); totPa += d.pallet || 0;
    });

    ws.addRow({ tipo: "TOTALE", quantita: totQ, colli: totC, peso_totale: Math.round(totP * 100) / 100, pallet: totPa });
    await styleSheet(ws, true);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Documenti_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
