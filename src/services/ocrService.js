const PdfService = require("./pdfService");
const TesseractService = require("./tesseractService");

class OcrService {
  async processDocument(pdfPath) {
    const { images, pageDir } = await PdfService.convertToImages(pdfPath);
    try {
      const maxPages = images.slice(0, 1);
      const ocrResults = await TesseractService.recognizeAll(maxPages);
      const allText = ocrResults.map((r) => "=== PAGE " + r.page + " ===\n" + r.text).join("\n\n");
      const parsed = this.parseDocument(allText);
      parsed.ocr_raw_text = allText;
      parsed.ocr_results = ocrResults.map((r) => ({ page: r.page, confidence: r.confidence }));
      parsed.tipo = this.classifyDocument(allText).tipo;
      return parsed;
    } finally {
      PdfService.cleanup(pageDir);
    }
  }

  parseDocument(text) {
    const ex = (p, g, d) => { if (g === undefined) g = 1; if (d === undefined) d = null; const m = text.match(p); return m ? m[g].trim() : d; };
    const cn = (v) => { if (!v) return null; const c = v.replace(/[,.]/g, ""); const n = parseFloat(c); return isNaN(n) ? null : n; };
    const ci = (v) => { if (!v) return null; const c = v.replace(/[^\d]/g, ""); return c ? parseInt(c, 10) : null; };

    let bolla = ex(/(?:NUMERO\s+BOLLA|NUMERO\s*BOLLA)[\s:.]*(\d{7,15})/i);
    if (!bolla) {
      const tens = text.match(/\b(\d{10})\b/);
      if (tens) bolla = tens[1];
    }

    const data = {
      numero_bolla: bolla,
      numero_documento: ex(/NUMERO\s*(\d{7,15})/),
      numero_ordine: ex(/(?:NUMERO\s*ORDINE|Num\.?\s*Ordine\s*Forn\.?)\s*[:.]?\s*(\d+)/i),
      numero_packing_list: ex(/(?:PACKING\s*LIST\s*No\.|PACKING\s*LIST\s*N\.?)\s*[:.]?\s*(\d+)/i),
      data_documento: ex(/(?:DATA\s*(?:USCITA\s*MERCI|DOCUMENTO))\s*[_:.\s]*(\d{2}\s*[\/\-\.]\s*\d{2}\s*[\/\-\.]\s*\d{4})/i),
      data_carico: null,
      mittente: null,
      destinatario: null,
      causale_trasporto: ex(/CAUSALE\s*TRASPORTO\s*(\S+)/i),
      picking: null,
    };

    const pickMatch = text.match(/(?:PICKING|PICK|Picking)\s*:?\s*(\d+)/i);
    if (pickMatch) {
      data.picking = pickMatch[1];
    } else if (data.numero_ordine) {
      data.picking = data.numero_ordine;
    }

    const dcMatch = text.match(/DATA\s*CARICO[\s\S]{0,80}?(\d{2}\s*[\/\-\.]\s*\d{2}\s*[\/\-\.]\s*\d{4})/i);
    if (dcMatch) data.data_carico = dcMatch[1];

    const locSection = text.match(/(?:LUOGO\s*SPEDIZIONE|que\s*\w+)[\s\S]{0,5}?((?:[^\n]+\n?){1,3})/i);
    if (locSection) data.mittente = locSection[1].trim();

    const destSection = text.match(/DESTINATARIO\s*MERCI[\s\S]{0,5}?((?:[^\n]+\n?){1,3})/i);
    if (destSection) data.destinatario = destSection[1].trim();

    const artLine = text.match(/(\w{6,18})\s+(\d{4,10})\s+(.{3,80}?)[\s.]+(?:KG|LT|MT|PZ)?[\s.]*([\d.,]+)/i);
    if (artLine) {
      data.codice_articolo = artLine[1].trim() + artLine[2].trim();
      data.descrizione_articolo = artLine[3].trim();
      data.quantita = cn(artLine[4]);
    }

    if (!data.codice_articolo) {
      const fb = text.match(/Materiale\s*(\w{8,25})\s*(.{5,80}?)(?:\s+Cod\.|\s*Note)/i);
      if (fb) {
        data.codice_articolo = fb[1].trim();
        data.descrizione_articolo = fb[2].trim();
      }
    }

    if (!data.codice_articolo) {
      const fb2 = text.match(/(\w{12,25})\s+(.{5,80}?)\s+[\d.,]+\s*[\d.,]*/);
      if (fb2) {
        data.codice_articolo = fb2[1].trim();
        data.descrizione_articolo = fb2[2].trim();
      }
    }

    const vt = text.match(/VETTORE\s*(?:\d+\s*)?:?\s*([^\n,]{3,})/i);
    if (vt) data.vettore_nome = vt[1].trim();
    data.vettore_targa = ex(/TARGA\s*(\S+)/i);

    let tot = text.match(/Totale\s*(?:Pos\.)?\s*(\d{1,6})\s+(\d+)\s+([\d.,]+)/i);
    if (tot) {
      data.colli = ci(tot[1]);
      data.peso_totale = cn(tot[3]);
    }
    if (!data.colli && !data.peso_totale) {
      tot = text.match(/(?:^|\n)\s*(\d{1,6})\s+(\d+)\s+([\d.,]+)\s*$/m);
      if (tot) {
        data.colli = ci(tot[1]);
        data.peso_totale = cn(tot[3]);
      }
    }
    if (!data.peso_totale && data.quantita) data.peso_totale = data.quantita;
    if (!data.colli && !data.peso_totale) {
      const tot2 = text.match(/Totale\s*(?:Pos\.)?\s*(\d{1,6})\s+([\d.,]+)/i);
      if (tot2) {
        data.colli = ci(tot2[1]);
        data.peso_totale = cn(tot2[2]);
      }
    }

    data.dettaglio = [];
    const lines = text.split("\n");
    let inDettaglio = false;
    for (const line of lines) {
      if (/Partita\s*Lotto/i.test(line)) { inDettaglio = true; continue; }
      if (inDettaglio && /Totale/i.test(line)) { inDettaglio = false; continue; }
      if (inDettaglio) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && /^[A-Z0-9]{6,}/i.test(parts[0])) {
          data.dettaglio.push({
            partita_lotto: parts[0],
            numero_rotelle: 1,
            peso: cn(parts[2]) || 0,
          });
        }
      }
    }

    return data;
  }

  classifyDocument(text) {
    const destSection = text.match(/DESTINATARIO\s*MERCI[\s\S]{0,400}?(?=\n\s*\n|SECONDO|VETTORE|$)/i);
    const d = destSection ? destSection[0] : "";
    const mittSection = text.match(/(?:LUOGO\s*SPEDIZIONE|que\s*\w+)[\s\S]{0,400}?(?=\s*CPT|\s*DESTINATARIO|\s*$)/i);
    const m = mittSection ? mittSection[0] : "";
    if (/logistic\s*solution/i.test(d)) return { tipo: "ENTRATA", motivazione: "Destinatario Logistic Solution" };
    if (/logistic\s*solution/i.test(m)) return { tipo: "USCITA", motivazione: "Mittente Logistic Solution" };
    return { tipo: null, motivazione: "Non determinabile" };
  }
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
