const { supabaseAdmin } = require("../db/supabase");

class DuplicateService {
  static async check(data) {
    if (!data.picking || !data.numero_bolla) return { duplicate: false, scenario: null, existing: null };

    let q = supabaseAdmin
      .from("documenti")
      .select("id, picking, numero_bolla, codice_articolo, tipo, data_documento, descrizione_articolo, colli, peso_totale, pallet, created_at")
      .eq("picking", data.picking)
      .eq("numero_bolla", data.numero_bolla);

    const { data: existing } = await q.maybeSingle();
    if (!existing) return { duplicate: false, scenario: null, existing: null };

    const sameArticle = existing.codice_articolo === data.codice_articolo;
    const sameQuantity = Number(existing.colli) === Number(data.colli || 0) && Number(existing.peso_totale) === Number(data.peso_totale || 0);

    if (sameArticle && sameQuantity) {
      return { duplicate: true, scenario: "identical", existing };
    }
    if (sameArticle) {
      return { duplicate: true, scenario: "same_article", existing };
    }
    return { duplicate: true, scenario: "different_article", existing };
  }
}

module.exports = DuplicateService;
