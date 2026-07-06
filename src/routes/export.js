const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ExcelJS = require("exceljs");

const MESI = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
const NF = '#,##0';
const NF2 = '#,##0.00';
const EUR = '€ #,##0.00';
const BDR = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

const COR = {
  pallet:    { h: "FF1a56db", l: "FFe8f0fe", a: "FFf0f4ff", s: "FFdbeafe" },
  giacenze:  { h: "FF059669", l: "FFecfdf5", a: "FFf0fdf4", s: "FFd1fae5" },
  movimenti: { h: "FFd97706", l: "FFfffbeb", a: "FFfff7ed", s: "FFfef3c7" },
  documenti: { h: "FF0891b2", l: "FFecfeff", a: "FFf0fdfa", s: "FFcffafe" },
};

function HC(a) { return { type: "pattern", pattern: "solid", fgColor: { argb: a } }; }
function sF(ws, addr, formula, r) { const c = ws.getCell(addr); c.value = { formula, result: r ?? 0 }; return c; }

function fmtDate(d) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
  return `${dt.getDate()}/${dt.getMonth()+1}/${String(dt.getFullYear()).slice(-2)}`;
}

// ── SOFFASS completo (12 fogli mensili + Foglio1, dati pallet) ──

async function buildSoffass(supabase, anno) {
  const cols = COR.pallet;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestionale LS SOFFASS";
  wb.created = new Date();

  const { data: movs } = await supabase
    .from("movimenti").select("tipo, pallet, data_movimento")
    .eq("codice_articolo", "PALLET").order("data_movimento");
  const movimenti = movs || [];

  const byMonth = {};
  for (let m = 0; m < 12; m++) {
    const start = `${anno}-${String(m+1).padStart(2,"0")}-01`;
    const dim = new Date(anno, m+1, 0).getDate();
    const end = `${anno}-${String(m+1).padStart(2,"0")}-${String(dim).padStart(2,"0")}`;
    const f = movimenti.filter(mm => mm.data_movimento >= start && mm.data_movimento <= end);
    const en = {}, us = {};
    let te = 0, tu = 0;
    for (const mm of f) {
      if (mm.tipo === "ENTRATA") { en[mm.data_movimento] = (en[mm.data_movimento]||0) + (mm.pallet||0); te += mm.pallet||0; }
      else { us[mm.data_movimento] = (us[mm.data_movimento]||0) + (mm.pallet||0); tu += mm.pallet||0; }
    }
    byMonth[m] = { en, us, te, tu };
  }
  let cum = 0;
  for (let m = 0; m < 12; m++) { byMonth[m].op = cum; cum += byMonth[m].te - byMonth[m].tu; }

  const PREZZO = 6750;
  const MQ_PER_DEP = 6.5;
  const T_INGRESSO = 6;
  const T_USCITA = 6;

  for (let m = 0; m < 12; m++) {
    const ws = wb.addWorksheet(MESI[m]);
    const bm = byMonth[m];
    const keys = [...new Set([...Object.keys(bm.en),...Object.keys(bm.us)])].sort();
    const nd = Math.max(keys.length, 1);
    const sr = nd <= 14 ? 33 : 19 + nd;
    const lr = sr - 1;
    const hf = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

    // Row 1 — headers
    const h1 = { A:"Pallet Entrati", B:"Pallet Usciti", D:"Pallet In deposito", F:"Prezzo ", G:"Deposito €", H:"Ingresso a plt", I:"Uscita a plt" };
    for (const [c,v] of Object.entries(h1)) { const cell = ws.getCell(c+"1"); cell.value=v; cell.fill=HC(cols.h); cell.font=hf; cell.alignment={horizontal:"center",vertical:"middle",wrapText:true}; cell.border=BDR; }
    ws.getRow(1).height = 28;

    // Row 3 — opening stock, prezzi, tariffe
    for (let c=1;c<=10;c++) { ws.getCell(3,c).fill=HC(cols.l); ws.getCell(3,c).border=BDR; ws.getCell(3,c).font={size:10}; }
    ws.getCell("D3").value = bm.op;
    ws.getCell("F3").value = PREZZO;
    ws.getCell("F3").numFmt = NF;
    sF(ws, "G3", "F4", MQ_PER_DEP);
    ws.getCell("G3").numFmt = NF2;
    ws.getCell("H3").value = T_INGRESSO;
    ws.getCell("I3").value = T_USCITA;
    ws.getCell("J3").value = "TARIFFE DA CONTRATTO";
    ws.getCell("J3").font = { bold: true, color: { argb: cols.h }, size: 10 };

    // Row 4 — totali mese con formule
    for (let c=1;c<=10;c++) { ws.getCell(4,c).fill=HC(cols.l); ws.getCell(4,c).border=BDR; ws.getCell(4,c).font={size:10}; }
    sF(ws, "A4", `C${sr}`, bm.te);
    ws.getCell("A4").numFmt = NF;
    sF(ws, "B4", `E${sr}`, bm.tu);
    ws.getCell("B4").numFmt = NF;
    const closeStock = bm.op + bm.te - bm.tu;
    sF(ws, "D4", "D3+A4-B4", closeStock);
    ws.getCell("D4").numFmt = NF;
    ws.getCell("F4").value = MQ_PER_DEP;
    ws.getCell("F4").numFmt = EUR;
    sF(ws, "G4", "F3*F4", PREZZO * MQ_PER_DEP);
    ws.getCell("G4").numFmt = EUR;
    ws.getCell("H4").value = T_INGRESSO;
    ws.getCell("H4").numFmt = EUR;
    ws.getCell("I4").value = T_USCITA;
    ws.getCell("I4").numFmt = EUR;

    // Rows 5-6 vuote
    [5,6].forEach(r => ws.getRow(r).height = 6);

    // Rows 7-9 — Entrati/Usciti/Extra
    [7,8,9].forEach(r => { for(let c=1;c<=10;c++) { ws.getCell(r,c).fill=HC(cols.a); ws.getCell(r,c).border=BDR; ws.getCell(r,c).font={size:10}; } });
    ws.getCell("B7").value = "Entrati plt n.";
    sF(ws, "D7", `C${sr}`, bm.te);
    ws.getCell("D7").numFmt = NF;
    sF(ws, "G7", "D7*I4", bm.te * T_USCITA);
    ws.getCell("G7").numFmt = EUR;
    ws.getCell("B8").value = "Usciti plt n.";
    sF(ws, "D8", `E${sr}`, bm.tu);
    ws.getCell("D8").numFmt = NF;
    sF(ws, "G8", "D8*I4", bm.tu * T_USCITA);
    ws.getCell("G8").numFmt = EUR;
    ws.getCell("B9").value = "EXTRA";
    sF(ws, "D9", `I${lr}`, T_USCITA);
    ws.getCell("D9").numFmt = NF2;
    sF(ws, "G9", "D9*22.5", T_USCITA * 22.5);
    ws.getCell("G9").numFmt = EUR;

    // Row 10 — totale
    for(let c=1;c<=10;c++) { ws.getCell(10,c).fill=HC(cols.s); ws.getCell(10,c).border=BDR; ws.getCell(10,c).font={bold:true,size:10}; }
    const totale = PREZZO * MQ_PER_DEP + bm.te * T_USCITA + bm.tu * T_USCITA + T_USCITA * 22.5;
    sF(ws, "G10", "G4+G7+G8+G9", totale);
    ws.getCell("G10").numFmt = EUR;

    // Rows 11-17 vuote
    for(let r=11;r<=17;r++) ws.getRow(r).height = 6;

    // Row 18 — sezione ENTRATI / USCITI
    for(let c=1;c<=10;c++) { ws.getCell(18,c).fill=HC(cols.h); ws.getCell(18,c).font=hf; ws.getCell(18,c).border=BDR; }
    ws.getCell("B18").value = "ENTRATI";
    ws.getCell("D18").value = "USCITI";

    // Rows 19+ — dati giornalieri
    let dr = 19;
    for (const d of keys) {
      const rc = (dr-19)%2===0 ? cols.l : "FFFFFFFF";
      for(let c=1;c<=10;c++) { ws.getCell(dr,c).fill=HC(rc); ws.getCell(dr,c).border=BDR; ws.getCell(dr,c).font={size:10}; }
      if (bm.en[d]) {
        ws.getCell("B"+dr).value = "";
        ws.getCell("C"+dr).value = "";
      }
      if (bm.us[d]) {
        ws.getCell("D"+dr).value = fmtDate(d);
        ws.getCell("E"+dr).value = bm.us[d];
        ws.getCell("E"+dr).numFmt = NF;
      }
      // Wait, let me re-check the layout. User CSV shows:
      // Row 19: D=7/1/26, E=36
      // Row 20: D=7/2/26, E=30
      // So USCITI go in D=date, E=value
      // ENTRATI would go in B=date, C=value (but in this example there are no entrate)
      if (bm.en[d]) {
        ws.getCell("B"+dr).value = fmtDate(d);
        ws.getCell("C"+dr).value = bm.en[d];
        ws.getCell("C"+dr).numFmt = NF;
      }
      if (bm.us[d]) {
        ws.getCell("D"+dr).value = fmtDate(d);
        ws.getCell("E"+dr).value = bm.us[d];
        ws.getCell("E"+dr).numFmt = NF;
      }
      ws.getRow(dr).height = 18;
      dr++;
    }
    while(dr<=lr) { ws.getRow(dr).height = 18; dr++; }

    // Sum row
    for(let c=1;c<=10;c++) { ws.getCell(sr,c).fill=HC(cols.s); ws.getCell(sr,c).border=BDR; ws.getCell(sr,c).font={bold:true,size:10}; }
    sF(ws, "C"+sr, "SUM(C19:C"+lr+")", bm.te);
    ws.getCell("C"+sr).numFmt = NF;
    sF(ws, "E"+sr, "SUM(E19:E"+lr+")", bm.tu);
    ws.getCell("E"+sr).numFmt = NF;

    for(let c=1;c<=10;c++) ws.getColumn(c).width=[16,20,18,16,18,10,14,16,14,24][c-1];
    ws.pageSetup.orientation="landscape"; ws.pageSetup.fitToPage=true;
  }

  // Foglio1
  const f1 = wb.addWorksheet("Foglio1");
  const fh = ["","CODICE ARTICOLO","NUMERO PACKING LIST","PARTITA","ROTELLE","DATA ENTRATA","DATA USCITA"];
  const {data:dettagli}=await supabase.from("dettaglio_documenti").select("partita_lotto,numero_rotelle,peso,documento_id,posizione").order("posizione");
  const {data:documenti}=await supabase.from("documenti").select("id,codice_articolo,descrizione_articolo,numero_packing_list,data_documento,tipo");
  const dm={}; if(documenti) documenti.forEach(d=>dm[d.id]=d);
  const fd=(dettagli||[]).map(dt=>{const doc=dm[dt.documento_id];if(!doc)return null;return [doc.codice_articolo,doc.numero_packing_list,dt.partita_lotto,dt.numero_rotelle,doc.data_documento,doc.tipo==="USCITA"?doc.data_documento:null];}).filter(Boolean);
  for(let c=1;c<fh.length;c++){const cell=f1.getCell(1,c+1);cell.value=fh[c];cell.fill=HC(cols.h);cell.font={bold:true,color:{argb:"FFFFFFFF"},size:11};cell.border=BDR;cell.alignment={horizontal:"center",vertical:"middle"};}
  f1.getRow(1).height=28;
  fd.forEach((row,i)=>{const r=i+2;const rc=i%2===0?cols.l:"FFFFFFFF";
    for(let c=1;c<=fh.length;c++){f1.getCell(r,c).fill=HC(rc);f1.getCell(r,c).border=BDR;f1.getCell(r,c).font={size:10};}
    f1.getCell("A"+r).value=i+1;
    row.forEach((v,j)=>{const cell=f1.getCell(r,j+2);if(j>=4&&v){cell.value=fmtDate(v);}else{cell.value=v;}if(typeof v==="number"&&j!==0)cell.numFmt=NF;});});
  f1.getColumn(1).width=8;for(let c=2;c<=fh.length;c++)f1.getColumn(c).width=24;
  f1.pageSetup.orientation="landscape";f1.pageSetup.fitToPage=true;

  return wb;
}

// ── Export semplici ──

async function exportGiacenze(supabase) {
  const wb=new ExcelJS.Workbook();wb.creator="Gestionale LS SOFFASS";wb.created=new Date();
  const ws=wb.addWorksheet("Giacenze");const cols=COR.giacenze;
  const hf={bold:true,color:{argb:"FFFFFFFF"},size:11};
  const hd=["Codice Articolo","Descrizione","Colli Totali","Peso Totale (KG)","Pallet Totali","Ultimo Aggiornamento"];
  hd.forEach((v,i)=>{const c=ws.getCell(1,i+1);c.value=v;c.fill=HC(cols.h);c.font=hf;c.border=BDR;c.alignment={horizontal:"center",vertical:"middle"};});
  ws.getRow(1).height=28;
  const {data:giacenze}=await supabase.from("giacenze").select("*").order("codice_articolo");
  (giacenze||[]).forEach((g,i)=>{const r=i+2;const rc=i%2===0?cols.l:"FFFFFFFF";
    [g.codice_articolo,g.descrizione_articolo,g.colli_totali||0,parseFloat(g.peso_totale||0),g.pallet_totali||0,
     g.ultimo_aggiornamento?new Date(g.ultimo_aggiornamento).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""]
    .forEach((v,j)=>{const c=ws.getCell(r,j+1);c.value=v;c.fill=HC(rc);c.border=BDR;c.font={size:10};if(typeof v==="number")c.numFmt=j===3?NF2:NF;});});
  ws.getColumn(1).width=22;ws.getColumn(2).width=50;ws.getColumn(3).width=15;ws.getColumn(4).width=20;ws.getColumn(5).width=16;ws.getColumn(6).width=22;
  ws.pageSetup.orientation="landscape";ws.pageSetup.fitToPage=true;return wb;
}

async function exportMovimenti(supabase, from, to) {
  const wb=new ExcelJS.Workbook();wb.creator="Gestionale LS SOFFASS";wb.created=new Date();
  const ws=wb.addWorksheet("Movimenti");const cols=COR.movimenti;
  const hf={bold:true,color:{argb:"FFFFFFFF"},size:11};
  const hd=["Data","Tipo","Numero Bolla","Codice Articolo","Descrizione","Colli","Peso (KG)","Pallet"];
  hd.forEach((v,i)=>{const c=ws.getCell(1,i+1);c.value=v;c.fill=HC(cols.h);c.font=hf;c.border=BDR;c.alignment={horizontal:"center",vertical:"middle"};});
  ws.getRow(1).height=28;
  let q=supabase.from("movimenti").select("*").order("data_movimento",{ascending:false});
  if(from)q=q.gte("data_movimento",from);if(to)q=q.lte("data_movimento",to);
  const {data:movs}=await q.limit(10000);
  (movs||[]).forEach((m,i)=>{const r=i+2;const rc=i%2===0?cols.l:"FFFFFFFF";
    [m.data_movimento,m.tipo,m.numero_bolla,m.codice_articolo,m.descrizione_articolo,m.colli||0,parseFloat(m.peso||0),m.pallet||0]
    .forEach((v,j)=>{const c=ws.getCell(r,j+1);c.value=v;c.fill=HC(rc);c.border=BDR;c.font={size:10};if(typeof v==="number")c.numFmt=j===6?NF2:NF;});});
  ws.getColumn(1).width=14;ws.getColumn(2).width=10;ws.getColumn(3).width=20;ws.getColumn(4).width=22;ws.getColumn(5).width=50;ws.getColumn(6).width=10;ws.getColumn(7).width=15;ws.getColumn(8).width=10;
  ws.pageSetup.orientation="landscape";ws.pageSetup.fitToPage=true;return wb;
}

async function exportDocumenti(supabase, tipo) {
  const wb=new ExcelJS.Workbook();wb.creator="Gestionale LS SOFFASS";wb.created=new Date();
  const ws=wb.addWorksheet("Documenti");const cols=COR.documenti;
  const hf={bold:true,color:{argb:"FFFFFFFF"},size:11};
  const hd=["Tipo","Data","Numero Bolla","Numero Documento","Codice Articolo","Descrizione","Quantità (KG)","Colli","Peso Totale","Pallet"];
  hd.forEach((v,i)=>{const c=ws.getCell(1,i+1);c.value=v;c.fill=HC(cols.h);c.font=hf;c.border=BDR;c.alignment={horizontal:"center",vertical:"middle"};});
  ws.getRow(1).height=28;
  let q=supabase.from("documenti").select("*").order("data_documento",{ascending:false});
  if(tipo)q=q.eq("tipo",tipo);
  const {data:docs}=await q.limit(10000);
  (docs||[]).forEach((d,i)=>{const r=i+2;const rc=i%2===0?cols.l:"FFFFFFFF";
    [d.tipo,d.data_documento,d.numero_bolla,d.numero_documento,d.codice_articolo,d.descrizione_articolo,parseInt(d.quantita||0),d.colli||0,parseFloat(d.peso_totale||d.quantita||0),d.pallet||0]
    .forEach((v,j)=>{const c=ws.getCell(r,j+1);c.value=v;c.fill=HC(rc);c.border=BDR;c.font={size:10};if(typeof v==="number")c.numFmt=j===6||j===8?NF2:NF;});});
  ws.getColumn(1).width=10;ws.getColumn(2).width=14;ws.getColumn(3).width=20;ws.getColumn(4).width=18;ws.getColumn(5).width=22;ws.getColumn(6).width=50;ws.getColumn(7).width=15;ws.getColumn(8).width=10;ws.getColumn(9).width=15;ws.getColumn(10).width=10;
  ws.pageSetup.orientation="landscape";ws.pageSetup.fitToPage=true;return wb;
}

// ── Rotte ──

router.get("/soffass", auth, async (req, res) => {
  try {
    const anno = parseInt(req.query.anno) || new Date().getFullYear();
    const wb = await buildSoffass(req.app.locals.supabase, anno);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename=BOBINE_SOFFASS_${anno}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(err) { res.status(500).json({error: err.message}); }
});

router.get("/pallet", auth, async (req, res) => {
  try {
    const anno = parseInt(req.query.anno) || new Date().getFullYear();
    const wb = await buildSoffass(req.app.locals.supabase, anno);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename=PALLET_${anno}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(err) { res.status(500).json({error: err.message}); }
});

router.get("/giacenze", auth, async (req, res) => {
  try {
    const wb = await exportGiacenze(req.app.locals.supabase);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename=GIACENZE_${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(err) { res.status(500).json({error: err.message}); }
});

router.get("/movimenti", auth, async (req, res) => {
  try {
    const wb = await exportMovimenti(req.app.locals.supabase, req.query.from, req.query.to);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename=MOVIMENTI_${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(err) { res.status(500).json({error: err.message}); }
});

router.get("/documenti", auth, async (req, res) => {
  try {
    const wb = await exportDocumenti(req.app.locals.supabase, req.query.tipo);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename=DOCUMENTI_${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(err) { res.status(500).json({error: err.message}); }
});

module.exports = router;
