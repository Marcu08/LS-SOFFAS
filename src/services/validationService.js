class ValidationService {
  static rules = {
    required: (data) => {
      const fields = ["numero_bolla", "codice_articolo", "descrizione_articolo"];
      const missing = fields.filter((f) => !data[f] || String(data[f]).trim() === "");
      return missing.length > 0
        ? { valid: false, errors: missing.map((f) => `Campo obbligatorio mancante: ${f}`) }
        : { valid: true };
    },
    descrizionePulita: (data) => {
      if (!data.descrizione_articolo) return { valid: true };
      if (data.descrizione_articolo.length < 3) {
        return { valid: false, warnings: ["Descrizione troppo corta (< 3 caratteri)"] };
      }
      const sporco = /^[\s|$#*@fd]+$|^\d+$/.test(data.descrizione_articolo);
      if (sporco) {
        return { valid: false, warnings: ["Descrizione articolo sembra errata (dati sporchi)"] };
      }
      return { valid: true };
    },
    confidenza: (data, { confidence } = {}) => {
      if (confidence == null) return { valid: true };
      if (confidence < 50) {
        return { valid: false, warnings: [`Confidenza OCR bassa (${confidence}%) - verificare i dati`] };
      }
      return { valid: true };
    },
    dataValida: (data) => {
      if (!data.data_documento) return { valid: true };
      const d = new Date(data.data_documento);
      if (isNaN(d.getTime())) {
        return { valid: false, warnings: ["Data documento non valida"] };
      }
      const future = new Date();
      future.setDate(future.getDate() + 31);
      if (d > future) {
        return { valid: false, warnings: ["Data documento è futura di oltre 30 giorni"] };
      }
      return { valid: true };
    },
    tipoDefinito: (data) => {
      if (!data.tipo) {
        return { valid: false, warnings: ["Tipo documento non determinato dall'OCR"] };
      }
      return { valid: true };
    },
    numeroPositivo: (data) => {
      const warnings = [];
      if (data.colli != null && isNaN(Number(data.colli))) warnings.push("Colli non numerici");
      if (data.peso_totale != null && isNaN(Number(data.peso_totale))) warnings.push("Peso totale non numerico");
      if (data.quantita != null && isNaN(Number(data.quantita))) warnings.push("Quantità non numerica");
      return warnings.length > 0
        ? { valid: false, warnings }
        : { valid: true };
    },
  };

  static validate(data, opts = {}) {
    const errors = [];
    const warnings = [];
    const activeRules = opts.rules || Object.keys(this.rules);

    for (const ruleName of activeRules) {
      const rule = this.rules[ruleName];
      if (!rule) continue;
      const result = rule(data, opts);
      if (result.errors) errors.push(...result.errors);
      if (result.warnings) warnings.push(...result.warnings);
    }

    const needsReview = warnings.length > 0;
    const isReady = errors.length === 0 && warnings.length === 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      needsReview,
      isReady,
    };
  }
}

module.exports = ValidationService;
