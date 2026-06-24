const PdfService = require("./pdfService");
const TesseractService = require("./tesseractService");

function itParse(v) {
  if (!v) return null;
  let s = v.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function itInt(v) {
  if (!v) return null;
  const c = v.replace(/[^\d]/g, "");
  return c ? parseInt(c, 10) : null;
}

class OcrService {
  async processDocument(pdfPath) {
    const { images, pageDir } = await PdfService.convertToImages(pdfPath);
    try {
      const maxPages = images.slice(0, 1);
      const allText = "";
      const parsed = this.parseDocument(allText);
      parsed.ocr_raw_text = allText;
      parsed.ocr_results = [{ page: 1, confidence: 0 }];
      parsed.tipo = this.classifyDocument(allText).tipo;
      return parsed;
    } finally {
      PdfService.cleanup(pageDir);
    }
  }

  parseDocument(text) {
    const data = {
      numero_bolla: null, numero_documento: null, numero_ordine: null,
      numero_packing_list: null, picking: null,
      data_documento: null, data_carico: null,
      mittente: null, destinatario: null,
      causale_trasporto: null,
      codice_articolo: null, descrizione_articolo: null,
      quantita: null, unita: "KG",
      colli: null, peso_totale: null, pallet: null,
      grammatura: null, altezza_bobina: null, diametro_bobina: null, diametro_anima: null,
      vettore_nome: null, vettore_targa: null,
      dettaglio: [],
      note: null,
    };

    const m = (p, g = 1) => { const r = text.match(p); return r ? r[g].trim() : null; };

    data.numero_ordine = m(/N\.?\s*ORD\.?\s*ACQ[^0-9]*(\d{6,15})/i);
    data.causale_trasporto = m(/CAUSALE\s*TRASPORTO[^A-Z]*(\S+)/i);

    const bolla = m(/(?:NUMERO\s*(?:BOLLA|DDT|DOCUMENTO|TRASPORTO))\s*[:.\s]*(\d{6,15})/i);
    data.numero_bolla = bolla || m(/\b(\d{10})\b/);

    data.numero_documento = m(/numeno\s*rrasronto[\s_]*(\d+)/i) || data.numero_bolla;

    if (data.numero_ordine && !data.picking) data.picking = data.numero_ordine;

    const dc = text.match(/DATA\s*CARICO[^0-9]*(\d{2})\s*[\/\-\.]\s*(\d{2})\s*[\/\-\.]\s*(\d{4})/i);
    if (dc) data.data_carico = `${dc[1]}/${dc[2]}/${dc[3]}`;

    const dd = text.match(/DATA\s*(?:USCITA\s*MERCI|DOCUMENTO|EMISSIONE)[^0-9]*(\d{2})\s*[\/\-\.]\s*(\d{2})\s*[\/\-\.]\s*(\d{4})/i);
    if (dd) data.data_documento = `${dd[1]}/${dd[2]}/${dd[3]}`;

    const mittMatch = text.match(/(?:UNION|Cartiera|MITTERE|LUOGO\s*SPEDIZIONE)[^A-Z]*((?:(?!DESTINATARIO|CAUSALE|VETTORE|CPT)[^\n]+\n?){1,4})/i);
    if (mittMatch) {
      data.mittente = mittMatch[1].replace(/^\s*\S+\s*/, "").replace(/\s*\|.*$/, "").trim();
    }

    const destMatch = text.match(/DESTINATARIO\s*MERCI\s*\d*\s*((?:[^\n]+\n?){1,4})/i);
    if (destMatch) {
      data.destinatario = destMatch[1].replace(/\s+\d+\s*$/, "").replace(/\s*SECONDO.*$/, "").trim();
    }

    const artLine = text.match(/([A-Z0-9]{8,16})\s+(\d{6,8})\s+(.{5,60}?)\s+(\d{3,4})\/(\d{3,4})\s+KG\s+([\d.,]+)/i);
    if (artLine) {
      data.codice_articolo = artLine[1].trim();
      data.descrizione_articolo = artLine[3].trim().replace(/[®™]/g, "").trim();
      data.quantita = itParse(artLine[6]);
    }

    if (!data.codice_articolo) {
      const fb = text.match(/(\w{10,20})\s+(\d{6,8})\s+(.{5,60}?)\s+(?:KG|LT|MT)\s+([\d.,]+)/i);
      if (fb) {
        data.codice_articolo = fb[1].trim();
        data.descrizione_articolo = fb[2].trim();
        data.quantita = itParse(fb[4]);
      }
    }

    const vt = text.match(/VETTORE\s*(\d{4,10})\s*\+?\s*([^\n]+)/i);
    if (vt) {
      data.vettore_nome = vt[2].trim();
      data.vettore_targa = m(/TARGA\s*(\S+)/i);
    }

    const totRow = text.match(/KG\s+([\d.,]+)\s*\n/i);
    if (totRow) data.peso_totale = itParse(totRow[1]);

    if (!data.peso_totale) {
      const kgVals = [...text.matchAll(/(?:KG|PESO)\s+(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?)/gi)];
      if (kgVals.length > 0) {
        const last = kgVals[kgVals.length - 1][1];
        data.peso_totale = itParse(last);
      }
    }

    const colliMatch = text.match(/(\d{1,4})\s*CCL/i);
    if (colliMatch) data.colli = parseInt(colliMatch[1], 10);

    const grMatch = text.match(/GRAMMATURA\s*(\d+[.,]\d+)\s*g/i);
    if (grMatch) data.grammatura = parseFloat(grMatch[1].replace(",", "."));

    const altMatch = text.match(/ALTEZZA\s*BOBINA\s*(\d+[.,]\d+)\s*cm/i);
    if (altMatch) data.altezza_bobina = parseFloat(altMatch[1].replace(",", "."));

    const diamMatch = text.match(/DIAMETRO\s*BOBINA\s*(\d+[.,]\d+)\s*cm/i);
    if (diamMatch) data.diametro_bobina = parseFloat(diamMatch[1].replace(",", "."));

    const animaMatch = text.match(/DIAMETRO\s*ANIMA\s*(\d+)\s*mM/i);
    if (animaMatch) data.diametro_anima = parseInt(animaMatch[1], 10);

    return data;
  }

  classifyDocument(text) {
    const destSection = text.match(/DESTINATARIO\s*MERCI[\s\S]{0,600}?(?=\n\s*\n|VETTORE|MERCE|$)/i);
    const d = destSection ? destSection[0] : text;
    const mittSection = text.match(/(?:LUOGO\s*SPEDIZIONE|que\s*\w+|UNION|Cartiera)[\s\S]{0,600}?(?=\s*CPT|\s*DESTINATARIO|\s*$)/i);
    const m = mittSection ? mittSection[0] : text;
    if (/logistic\s*solution|soffass/i.test(d)) return { tipo: "ENTRATA", motivazione: "Destinatario Logistic Solution" };
    if (/logistic\s*solution|soffass/i.test(m)) return { tipo: "USCITA", motivazione: "Mittente Logistic Solution" };
    if (/logistic\s*solution|soffass/i.test(text)) return { tipo: "ENTRATA", motivazione: "Trovato Logistic Solution nel testo" };
    return { tipo: null, motivazione: "Non determinabile" };
  }

  processText(ocrRawText) {
    const parsed = this.parseDocument(ocrRawText);
    parsed.ocr_raw_text = ocrRawText;
    parsed.ocr_results = [{ page: 1, confidence: 0 }];
    parsed.tipo = this.classifyDocument(ocrRawText).tipo;
    return parsed;
  }
}
module.exports = new OcrService();
