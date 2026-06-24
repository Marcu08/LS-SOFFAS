function itParse(v) {
  if (!v) return null;
  let s = v.trim();
  if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?$/.test(s)) {
    s = s.replace(/[.]/g, "").replace(",", ".");
  } else {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function itInt(v) {
  if (!v) return null;
  const c = v.replace(/[^\d]/g, "");
  return c ? parseInt(c, 10) : null;
}

class OcrService {
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
    data.numero_packing_list = m(/PACKING\s*LIST\s*No\.?\s*(\d+)/i);
    data.numero_documento = m(/NUMERO\s+(\d{6,15})/i);

    const bollaMatch = m(/NUMERO\s*BOLLA\s*(\d{6,15})/i);
    const refCliente = m(/\b(\d{10})\b.*Riferimento\s*Cliente/i) || m(/Riferimento\s*Cliente[^0-9]*(\d{6,15})/i);
    data.numero_bolla = bollaMatch || refCliente || data.numero_documento || data.numero_packing_list || m(/\b(\d{10})\b/);

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

    let artLine = text.match(/(300652N[A-Z0-9]{5,18})(?:\s+(\d{6,8}))?\s+(.{5,}?)\s+KG\s+([\d.,]+)(?:\s+(\d+))?/i);
    if (!artLine) {
      artLine = text.match(/((?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,24})(?:\s+(\d{6,8}))?\s+(.{5,}?)\s+KG\s+([\d.,]+)(?:\s+(\d+))?/i);
    }
    if (artLine) {
      data.codice_articolo = (artLine[1] + (artLine[2] || "")).trim();
      data.descrizione_articolo = artLine[3].trim().replace(/[®™]/g, "").trim();
      data.quantita = itParse(artLine[4]);
      const huVal = artLine[5] ? parseInt(artLine[5], 10) : 0;
      if (huVal > 0) data.colli = huVal;
    }

    if (!data.codice_articolo) {
      const fb = text.match(/((?=[A-Za-z0-9]*[A-Za-z])\w{10,20})(?:\s+(\d{6,8}))?\s+(.{5,}?)\s+(?:KG|LT|MT)\s+([\d.,]+)(?:\s+(\d+))?/i);
      if (fb) {
        data.codice_articolo = (fb[1] + (fb[2] || "")).trim();
        data.descrizione_articolo = fb[3].trim();
        data.quantita = itParse(fb[4]);
        const huValFb = fb[5] ? parseInt(fb[5], 10) : 0;
        if (huValFb > 0) data.colli = huValFb;
      }
    }

    const vt = text.match(/VETTORE\s*(\d{4,10})\s*\+?\s*([^\n]+)/i);
    if (vt) {
      data.vettore_nome = vt[2].trim();
      data.vettore_targa = m(/TARGA\s*(\S+)/i);
    }

    const totMatch = text.match(/Totale\s+Pos\.?\s+(\d+)\s+(\d+)\s+([\d.,]+)/i);
    if (totMatch) {
      data.colli = parseInt(totMatch[2], 10);
      data.peso_totale = itParse(totMatch[3]);
    }

    if (!data.peso_totale) {
      const kgRow = text.match(/TOTALE\s*PESO[^0-9]*KG\s*[_\s]*([\d.,]+)/i);
      if (kgRow) data.peso_totale = itParse(kgRow[1]);
    }

    if (!data.peso_totale) {
      const punit = text.match(/TOTALE\s*PESO\s*UNITA[^0-9]*KG\s+([\d.,]+)/i);
      if (punit) data.peso_totale = itParse(punit[1]);
    }

    if (!data.peso_totale) {
      const kgVals = [...text.matchAll(/(?:KG|PESO)\s*[_\s]*(\d{1,3}(?:[.,]\s?\d{3})*(?:[.,]\d+)?)/gi)];
      const nonZero = kgVals.map(v => itParse(v[1])).filter(v => v && v > 0);
      if (nonZero.length > 0) {
        data.peso_totale = nonZero[nonZero.length - 1];
      }
    }

    if (data.colli === null || data.colli === undefined) {
      const cMatch = text.match(/Totale\s+(\d+)\s+(\d+)\s+([\d.,]+)/i);
      if (cMatch) data.colli = parseInt(cMatch[2], 10);
    }

    if (data.colli === null || data.colli === undefined) {
      const unitMatch = text.match(/(?:UNITS|Units?|uns)\s*[:.]?\s*(\d+)/i) || text.match(/(\d+)\s*(?:units?|uns)/i);
      if (unitMatch) data.colli = parseInt(unitMatch[1], 10);
    }

    if (data.colli === null || data.colli === undefined) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/UNITS|units?|uns/i.test(lines[i])) {
          for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
            const nums = [...lines[j].matchAll(/\b(\d+)\b/g)].filter(m => m[1] !== "0" && m[1] !== "1");
            if (nums.length > 0) {
              data.colli = parseInt(nums[0][1], 10);
              break;
            }
          }
          break;
        }
      }
    }

    if ((data.colli === null || data.colli === undefined) && data.dettaglio && data.dettaglio.length > 0) {
      data.colli = data.dettaglio.length;
    }

    if (data.colli === null || data.colli === undefined) {
      data.colli = 1;
    }

    const grMatch = text.match(/GRAMMATURA\s*(\d+[.,]\d+)\s*g/i);
    if (grMatch) data.grammatura = parseFloat(grMatch[1].replace(",", "."));

    const altMatch = text.match(/ALTEZZA\s*BOBINA\s*(\d+[.,]\d+)\s*cm/i);
    if (altMatch) data.altezza_bobina = parseFloat(altMatch[1].replace(",", "."));

    const diamMatch = text.match(/DIAMETRO\s*BOBINA\s*(\d+[.,]\d+)\s*cm/i);
    if (diamMatch) data.diametro_bobina = parseFloat(diamMatch[1].replace(",", "."));

    const animaMatch = text.match(/DIAMETRO\s*ANIMA\s*(\d+)\s*mM/i);
    if (animaMatch) data.diametro_anima = parseInt(animaMatch[1], 10);

    data.dettaglio = this.parseDettaglio(text);

    return data;
  }

  parseDettaglio(text) {
    const items = [];
    const lines = text.split("\n");
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (/Partita\s*Lotto/i.test(line)) {
        inTable = true;
        continue;
      }

      if (inTable && /^Totale/i.test(line)) {
        inTable = false;
        continue;
      }

      if (!inTable) continue;
      if (!line || line.length < 10) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const partita = parts[0];
      const lotto = parts[1];
      const rotelle = parseInt(parts[2], 10);
      const pesoTxt = parts.slice(3).join("");

      if (!/^[A-Z0-9]{6,}$/i.test(partita)) continue;
      if (isNaN(rotelle) || rotelle < 1) continue;

      items.push({
        partita_lotto: partita,
        lotto: lotto || null,
        numero_rotelle: rotelle,
        peso: itParse(pesoTxt) || 0,
      });
    }

    return items;
  }

  classifyDocument(text) {
    if (/DATA\s*USCITA\s*MERCI/i.test(text)) {
      return { tipo: "USCITA", motivazione: "DATA USCITA MERCI presente" };
    }

    const destinatarioMatch = text.match(/DESTINATARIO\s*MERCI[\s\S]{0,500}?(?:logistic\s*solution|soffass\s*c\/o\s*logistic\s*solution)/i);
    const luogoSpedizioneMatch = text.match(/LUOGO\s*SPEDIZIONE[\s\S]{0,500}?(?:logistic\s*solution|soffass\s*c\/o\s*logistic\s*solution)/i);

    if (destinatarioMatch) {
      return { tipo: "ENTRATA", motivazione: "Destinatario Logistic Solution" };
    }
    if (luogoSpedizioneMatch) {
      return { tipo: "USCITA", motivazione: "Luogo Spedizione Logistic Solution" };
    }
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
