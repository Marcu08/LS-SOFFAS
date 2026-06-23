class StateMachine {
  static states = [
    "uploaded", "processing", "extracted",
    "needs_review", "ready_to_confirm", "confirmed", "error"
  ];

  static transitions = {
    uploaded:        { process: "processing" },
    processing:      { complete: "extracted", fail: "error" },
    extracted:       { review: "needs_review", confirm_ready: "ready_to_confirm" },
    needs_review:    { save_review: "needs_review", confirm_ready: "ready_to_confirm", cancel: "extracted" },
    ready_to_confirm:{ confirm: "confirmed", reject: "extracted" },
    confirmed:       {},
    error:           { retry: "uploaded" },
  };

  static canTransition(from, to) {
    const t = this.transitions[from];
    if (!t) return false;
    return Object.values(t).includes(to);
  }

  static getAction(from, to) {
    const t = this.transitions[from];
    if (!t) return null;
    for (const [action, state] of Object.entries(t)) {
      if (state === to) return action;
    }
    return null;
  }

  static isValidState(state) {
    return this.states.includes(state);
  }
}

module.exports = StateMachine;
