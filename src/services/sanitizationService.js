class SanitizationService {
  static applicaAll(data) {
    const out = { ...data };
    if (out.descrizione_articolo) out.descrizione_articolo = this.sanitizeDescrizione(out.descrizione_articolo);
    if (out.codice_articolo) out.codice_articolo = this.sanitizeCodice(out.codice_articolo);
    if (out.mittente) out.mittente = this.sanitizeText(out.mittente);
    if (out.destinatario) out.destinatario = this.sanitizeText(out.destinatario);
    if (out.causale_trasporto) out.causale_trasporto = out.causale_trasporto.trim();
    if (out.vettore_nome) out.vettore_nome = out.vettore_nome.trim();
    if (out.numero_bolla) out.numero_bolla = out.numero_bolla.trim();
    if (out.picking) out.picking = out.picking.trim();
    if (out.dettaglio && Array.isArray(out.dettaglio)) {
      out.dettaglio = out.dettaglio.map((d) => ({
        ...d,
        partita_lotto: d.partita_lotto ? d.partita_lotto.trim() : d.partita_lotto,
      }));
    }
    return out;
  }

  static sanitizeDescrizione(val) {
    if (!val) return val;
    let s = val.trim();
    s = s.replace(/^[\s|$#*@]+/g, "");
    s = s.replace(/[\s|$#*@]+$/g, "");
    s = s.replace(/\s+/g, " ");
    if (s.length < 3) return "";
    return s;
  }

  static sanitizeCodice(val) {
    if (!val) return val;
    return val.trim().replace(/\s+/g, "");
  }

  static sanitizeText(val) {
    if (!val) return val;
    return val.replace(/\s+/g, " ").trim();
  }
}

module.exports = SanitizationService;
