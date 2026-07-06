const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ExcelJS = require("exceljs");

const MESI = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const HL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a56db" } };
const HF = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const NF = '#,##0';
const BDR = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

function sF(ws, addr, formula, result) {
  const cell = ws.getCell(addr);
  cell.value = { formula, result: result ?? 0 };
  return cell;
}

router.get("/soffass", auth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;
    const anno = parseInt(req.query.anno) || new Date().getFullYear();

    const { data: movimenti } = await supabase
      .from("movimenti")
      .select("tipo, pallet, data_movimento")
      .eq("codice_articolo", "PALLET")
      .order("data_movimento");

    const movs = movimenti || [];

    const byMonth = {};
    for (let m = 0; m < 12; m++) {
      const start = `${anno}-${String(m + 1).padStart(2, "0")}-01`;
      byMonth[m] = { entrate: {}, uscite: {}, totaleEntrata: 0, totaleUscita: 0 };
      const daysInMonth = new Date(anno, m + 1, 0).getDate();
      const end = `${anno}-${String(m + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      movs.filter(mm => mm.data_movimento >= start && mm.data_movimento <= end).forEach(mm => {
        if (mm.tipo === "ENTRATA") {
          byMonth[m].entrate[mm.data_movimento] = (byMonth[m].entrate[mm.data_movimento] || 0) + (mm.pallet || 0);
          byMonth[m].totaleEntrata += mm.pallet || 0;
        } else {
          byMonth[m].uscite[mm.data_movimento] = (byMonth[m].uscite[mm.data_movimento] || 0) + (mm.pallet || 0);
          byMonth[m].totaleUscita += mm.pallet || 0;
        }
      });
    }

    let cumulativeStock = 0;
    const openingStock = [];
    for (let m = 0; m < 12; m++) {
      openingStock[m] = cumulativeStock;
      cumulativeStock += byMonth[m].totaleEntrata - byMonth[m].totaleUscita;
    }

    const { data: dettagli } = await supabase
      .from("dettaglio_documenti")
      .select("partita_lotto, numero_rotelle, peso, documento_id, posizione")
      .order("posizione");

    const { data: documenti } = await supabase
      .from("documenti")
      .select("id, codice_articolo, descrizione_articolo, numero_packing_list, data_documento, tipo");

    const docMap = {};
    if (documenti) documenti.forEach(d => docMap[d.id] = d);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Gestionale LS SOFFASS";
    wb.created = new Date();

    const allDates = new Set();
    movs.forEach(mm => allDates.add(mm.data_movimento));

    const ordinaDate = (dates) => Object.keys(dates).sort();

    for (let m = 0; m < 12; m++) {
      const ws = wb.addWorksheet(MESI[m]);
      const month = byMonth[m];
      const entrate = month.entrate;
      const uscite = month.uscite;
      const dataKeys = [...new Set([...Object.keys(entrate), ...Object.keys(uscite)])].sort();

      const prezzo = 6750;
      const tariffaIng = 6;
      const tariffaUs = 6;

      const nDataRows = Math.max(dataKeys.length, 1);
      let sumRow;
      if (nDataRows <= 14) { sumRow = 33; } else { sumRow = 19 + nDataRows; }
      const lastDataRow = sumRow - 1;

      // Row 1 — headers
      const h1 = { A: "Pallet Entrati", B: "Pallet Usciti", D: "Pallet In deposito", F: "Prezzo ", G: "Deposito €", H: "Ingresso a plt", I: "Uscita a plt" };
      for (const [c, v] of Object.entries(h1)) { const cell = ws.getCell(c + "1"); cell.value = v; cell.fill = HL; cell.font = HF; }
      ws.getRow(1).height = 28;

      // Row 2
      ws.getCell("F2").value = "MQ PER DEP.";

      // Row 3 — opening stock
      ws.getCell("D3").value = openingStock[m];
      ws.getCell("F3").value = prezzo;
      sF(ws, "G3", "F3*F4", prezzo);
      ws.getCell("H3").value = tariffaIng;
      ws.getCell("I3").value = tariffaUs;
      ws.getCell("J3").value = "TARIFFE DA CONTRATTO";

      // Row 4 — summary row with refs to sumRow
      sF(ws, "A4", `C${sumRow}`, month.totaleEntrata);
      sF(ws, "B4", `E${sumRow}`, month.totaleUscita);
      sF(ws, "D4", `D3+A4-B4`, openingStock[m] + month.totaleEntrata - month.totaleUscita);
      ws.getCell("F4").value = tariffaIng;
      sF(ws, "G4", "F3*F4", prezzo * tariffaIng);
      ws.getCell("H4").value = tariffaIng;
      ws.getCell("I4").value = tariffaUs;

      // Rows 5-6 empty

      // Row 7 — Entrati plt n.
      ws.getCell("B7").value = "Entrati plt n.";
      sF(ws, "D7", `C${sumRow}`, month.totaleEntrata);
      sF(ws, "G7", `D7*I4`, month.totaleEntrata * tariffaUs);

      // Row 8 — Usciti plt n.
      ws.getCell("B8").value = "Usciti plt n.";
      sF(ws, "D8", `E${sumRow}`, month.totaleUscita);
      sF(ws, "G8", `D8*I4`, month.totaleUscita * tariffaUs);

      // Row 9 — EXTRA
      ws.getCell("B9").value = "EXTRA";
      sF(ws, "D9", `I${lastDataRow}`, tariffaUs);
      sF(ws, "G9", "D9*22.5", tariffaUs * 22.5);

      // Row 10 — total
      sF(ws, "G10", "G4+G7+G8+G9", (prezzo * tariffaIng) + (month.totaleEntrata * tariffaUs) + (month.totaleUscita * tariffaUs) + (tariffaUs * 22.5));

      // Rows 11-17 empty
      for (let r = 11; r <= 17; r++) ws.getRow(r).height = 18;

      // Row 18 — subsection headers
      ws.getCell("B18").value = "ENTRATI";
      ws.getCell("B18").font = { bold: true };
      ws.getCell("D18").value = "USCITI";
      ws.getCell("D18").font = { bold: true };

      // Rows 19 to lastDataRow — daily data
      let dr = 19;
      for (const d of dataKeys) {
        if (entrate[d]) {
          ws.getCell(`B${dr}`).value = d;
          ws.getCell(`C${dr}`).value = entrate[d];
          ws.getCell(`C${dr}`).numFmt = NF;
        }
        if (uscite[d]) {
          ws.getCell(`D${dr}`).value = d;
          ws.getCell(`E${dr}`).value = uscite[d];
          ws.getCell(`E${dr}`).numFmt = NF;
        }
        ws.getRow(dr).height = 18;
        dr++;
      }
      while (dr <= lastDataRow) { ws.getRow(dr).height = 18; dr++; }

      // Sum row
      sF(ws, `C${sumRow}`, `SUM(C19:C${lastDataRow})`, month.totaleEntrata);
      ws.getCell(`C${sumRow}`).numFmt = NF;
      sF(ws, `E${sumRow}`, `SUM(E19:E${lastDataRow})`, month.totaleUscita);
      ws.getCell(`E${sumRow}`).numFmt = NF;

      // Column widths
      for (let c = 1; c <= 10; c++) {
        const w = [16, 20, 18, 16, 18, 10, 14, 16, 14, 24][c - 1];
        ws.getColumn(c).width = w;
      }
    }

    // Foglio1 — coil catalog
    const f1 = wb.addWorksheet("Foglio1");
    f1.getCell("B1").value = "CODICE ARTICOLO";
    f1.getCell("C1").value = "NUMERO PACKING LIST";
    f1.getCell("D1").value = "PARTITA";
    f1.getCell("E1").value = "LOTTO";
    f1.getCell("F1").value = "DATA ENTRATA";
    f1.getCell("G1").value = "DATA USCITA";
    for (let c = 2; c <= 7; c++) { const cell = f1.getCell(1, c); cell.fill = HL; cell.font = HF; }
    f1.getRow(1).height = 28;

    let seq = 0;
    const items = dettagli || [];
    for (const dt of items) {
      const doc = docMap[dt.documento_id];
      if (!doc) continue;
      seq++;
      f1.getCell(`A${seq + 1}`).value = seq;
      f1.getCell(`B${seq + 1}`).value = doc.codice_articolo;
      f1.getCell(`C${seq + 1}`).value = doc.numero_packing_list;
      f1.getCell(`D${seq + 1}`).value = dt.partita_lotto;
      f1.getCell(`E${seq + 1}`).value = dt.numero_rotelle;
      f1.getCell(`F${seq + 1}`).value = doc.data_documento;
      f1.getCell(`G${seq + 1}`).value = doc.tipo === "USCITA" ? doc.data_documento : null;
      for (let c = 2; c <= 7; c++) f1.getCell(seq + 1, c).border = BDR;
    }
    f1.getColumn(1).width = 8;
    f1.getColumn(2).width = 30;
    f1.getColumn(3).width = 22;
    f1.getColumn(4).width = 18;
    f1.getColumn(5).width = 12;
    f1.getColumn(6).width = 16;
    f1.getColumn(7).width = 16;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=BOBINE_SOFFASS_${anno}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;