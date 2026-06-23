const { supabaseAdmin } = require("../db/supabase");
const StateMachine = require("./stateMachine");

class DocumentStateService {
  static async transition({ id, action, userId, meta = {} }) {
    const { data: raw, error: fetchErr } = await supabaseAdmin
      .from("documenti_raw")
      .select("id, stato")
      .eq("id", id)
      .single();

    if (fetchErr) throw new Error("Documento raw non trovato: " + fetchErr.message);
    if (!raw) throw new Error("Documento raw non trovato");

    const from = raw.stato;
    const to = StateMachine.transitions[from]?.[action];
    if (!to) throw new Error(`Azione '${action}' non valida dallo stato '${from}'`);

    const { error: updateErr } = await supabaseAdmin
      .from("documenti_raw")
      .update({ stato: to, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) throw new Error("Errore aggiornamento stato: " + updateErr.message);

    const eventName = this.eventNameFor(action, to);

    const { error: logErr } = await supabaseAdmin
      .from("event_log")
      .insert([{
        documento_id: id,
        evento: eventName,
        dettaglio: { ...meta, from, to },
        created_by: userId,
      }]);

    if (logErr) console.error("Errore logging evento:", logErr.message);

    return { from, to, action, event: eventName };
  }

  static eventNameFor(action, to) {
    const map = {
      process: "ocr_start",
      fail: "ocr_error",
      complete: "ocr_end",
      review: "validation_warning",
      confirm_ready: "validation_pass",
      save_review: "review_saved",
      confirm: "confirmed",
      reject: "rejected",
      retry: "retry",
    };
    return map[action] || action;
  }

  static async getStatus(id) {
    const { data, error } = await supabaseAdmin
      .from("documenti_raw")
      .select("id, stato, ocr_raw_text, ocr_confidence, dati_estratti, error_message, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) throw new Error("Errore recupero stato: " + error.message);
    return data;
  }

  static async getEvents(id) {
    const { data, error } = await supabaseAdmin
      .from("event_log")
      .select("*")
      .eq("documento_id", id)
      .order("created_at", { ascending: true });

    if (error) throw new Error("Errore recupero eventi: " + error.message);
    return data || [];
  }
}

module.exports = DocumentStateService;
