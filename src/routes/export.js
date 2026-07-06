const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ExcelJS = require("exceljs");

const MESI = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const NF = '#,##0';
const BDR = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

const TC = {
  pallet:    { h: "FF1a56db", l: "FFe8f0fe", a: "FFf0f4ff", s: "FFdbeafe" },
  giacenze:  { h: "FF059669", l: "FFecfdf5", a: "FFf0fdf4", s: "FFd1fae5" },
  movimenti: { h: "FFd97706", l: "FFfffbeb", a: "FFfff7ed", s: "FFfef3c7" },
  documenti: { h: "FF0891b2", l: "FFecfeff", a: "FFf0fdfa", s: "FFcffafe" },
};

function HC(a) { return { type: "pattern", pattern: "solid", fgColor: { argb: a } }; }

function sF(ws, addr, formula, result) {
  const cell = ws.getCell(addr);
  cell.value = { formula, result: result ?? 0 };
  return cell;
}

const CFG = {
  pallet: {
    label: "PALLET", colF: 6750, tariffaIng: 6, tariffaUs: 6, extraVal: 22.5,
    h1: { A: "Pallet Entrati", B: "Pallet Usciti", D: "Pallet In deposito", F: "Prezzo ", G: "Deposito €", H: "Ingresso a plt", I: "Uscita a plt" },
    h2: "MQ PER DEP.", h7: "Entrati plt n.", h8: "Usciti plt n.",
  },
  giacenze: {
    label: "GIACENZE", colF: 1, tariffaIng: 1, tariffaUs: 1, extraVal: 0,
    h1: { A: "Carico (colli)", B: "Scarico (colli)", D: "Giacenza (colli)", F: "Peso/Unità", G: "Peso Totale", H: "Kg/Op", I: "Pallet/Op" },
    h2: "PESO MEDIO", h7: "Totale Carico", h8: "Totale Scarico",
  },
  movimenti: {
    label: "MOVIMENTI", colF: 1, tariffaIng: 1, tariffaUs: 1, extraVal: 0,
    h1: { A: "Mov. Entrata", B: "Mov. Uscita", D: "Bilancio", F: "Peso/Op", G: "Costo", H: "Colli/Op", I: "Pallet/Op" },
    h2: "PESO MEDIO", h7: "Totale Entrate", h8: "Totale Uscite",
  },
  documenti: {
    label: "DOCUMENTI", colF: 1, tariffaIng: 1, tariffaUs: 1, extraVal: 0,
    h1: { A: "Doc. Entrata", B: "Doc. Uscita", D: "Deposito Doc.", F: "Quantità", G: "Peso Totale", H: "Colli", I: "Pallet" },
    h2: "MEDIA PER DOC.", h7: "Documenti Entrata", h8: "Documenti Uscita",
  },
};

async function buildMonthlySheet(wb, m, anno, cfg, mesiData, cols) {
  const ws = wb.addWorksheet(MESI[m]);
  const md = mesiData[m];
  const entrate = md.entrate || {};
  const uscite = md.uscite || {};
  const dataKeys = [...new Set([...Object.keys(entrate), ...Object.keys(uscite)])].sort();
  const nDataRows = Math.max(dataKeys.length, 1);
  const sumRow = nDataRows <= 14 ? 33 : 19 + nDataRows;
  const lastDataRow = sumRow - 1;
  const hFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

  for (const [c, v] of Object.entries(cfg.h1)) { const cell = ws.getCell(c + "1"); cell.value = v; cell.fill = HC(cols.h); cell.font = hFont; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = BDR; }
  ws.getRow(1).height = 28;

  [3, 4].forEach(r => { for (let c = 1; c <= 10; c++) { ws.getCell(r, c).fill = HC(cols.l); ws.getCell(r, c).border = BDR; } });
  ws.getCell("D3").value = md.openingStock;
  ws.getCell("F3").value = cfg.colF;
  sF(ws, "G3", "F3*F4", cfg.colF);
  ws.getCell("H3").value = cfg.tariffaIng;
  ws.getCell("I3").value = cfg.tariffaUs;
  ws.getCell("J3").value = `${cfg.label} ${MESI[m]} ${anno}`;
  ws.getCell("J3").font = { bold: true, color: { argb: cols.h }, size: 10 };

  sF(ws, "A4", `C${sumRow}`, md.totEntrata);
  sF(ws, "B4", `E${sumRow}`, md.totUscita);
  sF(ws, "D4", "D3+A4-B4", md.openingStock + md.totEntrata - md.totUscita);
  ws.getCell("F4").value = cfg.tariffaIng;
  sF(ws, "G4", "F3*F4", cfg.colF * cfg.tariffaIng);
  ws.getCell("H4").value = cfg.tariffaIng;
  ws.getCell("I4").value = cfg.tariffaUs;

  [5, 6].forEach(r => ws.getRow(r).height = 8);

  [7, 8, 9].forEach(r => { for (let c = 1; c <= 10; c++) { ws.getCell(r, c).fill = HC(cols.a); ws.getCell(r, c).border = BDR; ws.getCell(r, c).font = { size: 10 }; } });
  ws.getCell("B7").value = cfg.h7; sF(ws, "D7", `C${sumRow}`, md.totEntrata); sF(ws, "G7", "D7*I4", md.totEntrata * cfg.tariffaUs);
  ws.getCell("B8").value = cfg.h8; sF(ws, "D8", `E${sumRow}`, md.totUscita); sF(ws, "G8", "D8*I4", md.totUscita * cfg.tariffaUs);
  ws.getCell("B9").value = "EXTRA"; sF(ws, "D9", `I${lastDataRow}`, cfg.tariffaUs); sF(ws, "G9", "D9*" + cfg.extraVal, cfg.tariffaUs * cfg.extraVal);

  for (let c = 1; c <= 10; c++) { ws.getCell(10, c).fill = HC(cols.s); ws.getCell(10, c).border = BDR; ws.getCell(10, c).font = { bold: true, size: 10 }; }
  sF(ws, "G10", "G4+G7+G8+G9", (cfg.colF * cfg.tariffaIng) + (md.totEntrata * cfg.tariffaUs) + (md.totUscita * cfg.tariffaUs) + (cfg.tariffaUs * cfg.extraVal));

  for (let r = 11; r <= 17; r++) ws.getRow(r).height = 8;

  for (let c = 1; c <= 10; c++) { ws.getCell(18, c).fill = HC(cols.h); ws.getCell(18, c).font = hFont; ws.getCell(18, c).border = BDR; }
  ws.getCell("B18").value = "ENTRATI";
  ws.getCell("D18").value = "USCITI";

  let dr = 19;
  for (const d of dataKeys) {
    const rc = (dr - 19) % 2 === 0 ? cols.l : "FFFFFFFF";
    for (let c = 1; c <= 10; c++) { ws.getCell(dr, c).fill = HC(rc); ws.getCell(dr, c).border = BDR; ws.getCell(dr, c).font = { size: 10 }; }
    if (entrate[d]) { ws.getCell(`B${dr}`).value = d; ws.getCell(`C${dr}`).value = entrate[d]; ws.getCell(`C${dr}`).numFmt = NF; }
    if (uscite[d]) { ws.getCell(`D${dr}`).value = d; ws.getCell(`E${dr}`).value = uscite[d]; ws.getCell(`E${dr}`).numFmt = NF; }
    ws.getRow(dr).height = 18;
    dr++;
  }
  while (dr <= lastDataRow) { ws.getRow(dr).height = 18; dr++; }

  for (let c = 1; c <= 10; c++) { ws.getCell(sumRow, c).fill = HC(cols.s); ws.getCell(sumRow, c).border = BDR; ws.getCell(sumRow, c).font = { bold: true, size: 10 }; }
  sF(ws, "C" + sumRow, "SUM(C19:C" + lastDataRow + ")", md.totEntrata); ws.getCell("C" + sumRow).numFmt = NF;
  sF(ws, "E" + sumRow, "SUM(E19:E" + lastDataRow + ")", md.totUscita); ws.getCell("E" + sumRow).numFmt = NF;

  for (let c = 1; c <= 10; c++) ws.getColumn(c).width = [16, 20, 18, 16, 18, 10, 14, 16, 14, 24][c - 1];
  ws.pageSetup.orientation = "landscape";
  ws.pageSetup.fitToPage = true;
}

const TIPI_FILTRO = {
  pallet: { code: "PALLET", neq: false },
  giacenze: { code: null, neq: true },
  movimenti: { code: null, neq: false },
  documenti: { code: null, neq: false },
};

async function getTipoData(supabase, anno, tipo) {
  const f = TIPI_FILTRO[tipo];
  let query = supabase.from("movimenti").select("tipo, pallet, colli, peso, data_movimento, codice_articolo, picking, numero_bolla, descrizione_articolo");
  if (f.code) query = query.eq("codice_articolo", f.code);
  if (f.neq) query = query.neq("codice_articolo", "PALLET");
  query = query.order("data_movimento");
  const { data: movs } = await query.limit(50000);
  const movimenti = movs || [];

  const byMonth = {};
  for (let m = 0; m < 12; m++) {
    const start = `${anno}-${String(m + 1).padStart(2, "0")}-01`;
    const dInM = new Date(anno, m + 1, 0).getDate();
    const end = `${anno}-${String(m + 1).padStart(2, "0")}-${String(dInM).padStart(2, "0")}`;
    const filtered = movimenti.filter(mm => mm.data_movimento >= start && mm.data_movimento <= end);
    const entrate = {}, uscite = {};
    let totEntrata = 0, totUscita = 0;
    for (const mm of filtered) {
      let val;
      if (tipo === "pallet") val = mm.pallet || 0;
      else if (tipo === "documenti") val = 1;
      else val = mm.colli || 0;
      if (mm.tipo === "ENTRATA") { entrate[mm.data_movimento] = (entrate[mm.data_movimento] || 0) + val; totEntrata += val; }
      else { uscite[mm.data_movimento] = (uscite[mm.data_movimento] || 0) + val; totUscita += val; }
    }
    byMonth[m] = { entrate, uscite, totEntrata, totUscita };
  }

  let cum = 0;
  for (let m = 0; m < 12; m++) { byMonth[m].openingStock = cum; cum += byMonth[m].totEntrata - byMonth[m].totUscita; }
  return byMonth;
}

async function buildFoglio1(wb, supabase, tipo) {
  const cfg = CFG[tipo];
  const cols = TC[tipo];
  const f1 = wb.addWorksheet("Foglio1");
  let headers, data;

  if (tipo === "pallet") {
    headers = ["", "CODICE ARTICOLO", "NUMERO PACKING LIST", "PARTITA", "ROTELLE", "DATA ENTRATA", "DATA USCITA"];
    const { data: dettagli } = await supabase.from("dettaglio_documenti").select("partita_lotto, numero_rotelle, peso, documento_id, posizione").order("posizione");
    const { data: documenti } = await supabase.from("documenti").select("id, codice_articolo, descrizione_articolo, numero_packing_list, data_documento, tipo");
    const docMap = {};
    if (documenti) documenti.forEach(d => docMap[d.id] = d);
    data = (dettagli || []).map(dt => { const doc = docMap[dt.documento_id]; if (!doc) return null; return [doc.codice_articolo, doc.numero_packing_list, dt.partita_lotto, dt.numero_rotelle, doc.data_documento, doc.tipo === "USCITA" ? doc.data_documento : null]; }).filter(Boolean);
  } else if (tipo === "giacenze") {
    headers = ["", "CODICE ARTICOLO", "DESCRIZIONE", "COLLI TOTALI", "PESO TOTALE", "PALLET TOTALI"];
    const { data: giacenze } = await supabase.from("giacenze").select("*").order("codice_articolo");
    data = (giacenze || []).map(g => [g.codice_articolo, g.descrizione_articolo, g.colli_totali, g.peso_totale, g.pallet_totali]);
  } else if (tipo === "movimenti") {
    headers = ["", "CODICE ARTICOLO", "DESCRIZIONE", "DATA", "TIPO", "COLLI", "PESO", "BOLLA", "PICKING"];
    const { data: movimenti } = await supabase.from("movimenti").select("*").order("data_movimento", { ascending: false }).limit(5000);
    data = (movimenti || []).map(m => [m.codice_articolo, m.descrizione_articolo, m.data_movimento, m.tipo, m.colli, m.peso, m.numero_bolla, m.picking]);
  } else {
    headers = ["", "NUMERO BOLLA", "ARTICOLO", "DESCRIZIONE", "DATA", "TIPO", "COLLI", "PESO", "PALLET"];
    const { data: documenti } = await supabase.from("documenti").select("*").order("data_documento", { ascending: false }).limit(5000);
    data = (documenti || []).map(d => [d.numero_bolla, d.codice_articolo, d.descrizione_articolo, d.data_documento, d.tipo, d.colli, d.peso_totale || d.quantita, d.pallet]);
  }

  for (let c = 1; c < headers.length; c++) { const cell = f1.getCell(1, c + 1); cell.value = headers[c]; cell.fill = HC(cols.h); cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }; cell.border = BDR; cell.alignment = { horizontal: "center", vertical: "middle" }; }
  f1.getRow(1).height = 28;

  (data || []).forEach((row, i) => {
    const r = i + 2;
    const rc = i % 2 === 0 ? cols.l : "FFFFFFFF";
    for (let c = 1; c <= headers.length; c++) { f1.getCell(r, c).fill = HC(rc); f1.getCell(r, c).border = BDR; f1.getCell(r, c).font = { size: 10 }; }
    f1.getCell("A" + r).value = i + 1;
    row.forEach((v, j) => { const cell = f1.getCell(r, j + 2); cell.value = v; if (typeof v === "number") cell.numFmt = NF; });
  });

  f1.getColumn(1).width = 8;
  for (let c = 2; c <= headers.length; c++) f1.getColumn(c).width = 24;
  f1.pageSetup.orientation = "landscape";
  f1.pageSetup.fitToPage = true;
}

async function buildSoffassWorkbook(supabase, anno, tipo) {
  const cfg = CFG[tipo];
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestionale LS SOFFASS";
  wb.created = new Date();
  const mesiData = await getTipoData(supabase, anno, tipo);
  for (let m = 0; m < 12; m++) await buildMonthlySheet(wb, m, anno, cfg, mesiData, TC[tipo]);
  await buildFoglio1(wb, supabase, tipo);
  return wb;
}

const TL = { pallet: "PALLET", giacenze: "GIACENZE", movimenti: "MOVIMENTI", documenti: "DOCUMENTI" };

["pallet", "giacenze", "movimenti", "documenti"].forEach(tipo => {
  router.get(`/${tipo}`, auth, async (req, res) => {
    try {
      const anno = parseInt(req.query.anno) || new Date().getFullYear();
      const wb = await buildSoffassWorkbook(req.app.locals.supabase, anno, tipo);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${TL[tipo]}_${anno}.xlsx`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

router.get("/soffass", auth, async (req, res) => {
  try {
    const anno = parseInt(req.query.anno) || new Date().getFullYear();
    const wb = await buildSoffassWorkbook(req.app.locals.supabase, anno, "pallet");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=BOBINE_SOFFASS_${anno}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
