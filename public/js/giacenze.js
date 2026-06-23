const Giacenze = {
  data: null,

  async render(el) {
    el.innerHTML = '<p style="text-align:center;padding:40px;color:var(--gray-400);">Caricamento giacenze...</p>';
    try {
      const res = await App.api("/giacenze");
      const data = await res.json();
      this.data = data.giacenze || [];
      el.innerHTML = this.renderTable();
      this.attach(el);
    } catch (e) {
      el.innerHTML = `<p style="text-align:center;padding:40px;color:var(--danger);">Errore: ${e.message}</p>`;
    }
  },

  renderTable() {
    const items = this.data || [];
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <div class="card-title" style="margin-bottom:0;">Giacenze di Magazzino</div>
          <span style="font-size:12px;color:var(--gray-500);">${items.length} articoli</span>
        </div>
        <div class="search-bar">
          <input type="text" id="giacenze-search" placeholder="Cerca per codice articolo o descrizione...">
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th onclick="Giacenze.sort('codice_articolo')">Codice Articolo</th>
                <th onclick="Giacenze.sort('descrizione_articolo')">Descrizione</th>
                <th onclick="Giacenze.sort('colli_totali')">Colli</th>
                <th onclick="Giacenze.sort('peso_totale')">Peso (KG)</th>
                <th onclick="Giacenze.sort('pallet_totali')">Pallet</th>
                <th>Ultimo Agg.</th>
              </tr>
            </thead>
            <tbody id="giacenze-body">
              ${items.length > 0 ? items.map((g) => `
                <tr>
                  <td><strong>${g.codice_articolo}</strong></td>
                  <td style="max-width:300px;">${g.descrizione_articolo || ""}</td>
                  <td>${g.colli_totali || 0}</td>
                  <td>${App.formatNumber(g.peso_totale)}</td>
                  <td>${g.pallet_totali || 0}</td>
                  <td>${g.ultimo_aggiornamento ? new Date(g.ultimo_aggiornamento).toLocaleDateString("it-IT") : ""}</td>
                </tr>
              `).join("") : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray-400);">Nessuna giacenza presente</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  attach(el) {
    const search = document.getElementById("giacenze-search");
    if (search) {
      search.addEventListener("input", () => this.filter(search.value));
    }
  },

  filter(query) {
    const term = query.toLowerCase();
    const rows = document.querySelectorAll("#giacenze-body tr");
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? "" : "none";
    });
  },

  sort(field) {
    if (!this.data) return;
    this.data.sort((a, b) => {
      const va = a[field] || 0;
      const vb = b[field] || 0;
      if (typeof va === "string") return va.localeCompare(vb);
      return vb - va;
    });
    const body = document.getElementById("giacenze-body");
    if (body) {
      body.innerHTML = this.data.map((g) => `
        <tr>
          <td><strong>${g.codice_articolo}</strong></td>
          <td style="max-width:300px;">${g.descrizione_articolo || ""}</td>
          <td>${g.colli_totali || 0}</td>
          <td>${App.formatNumber(g.peso_totale)}</td>
          <td>${g.pallet_totali || 0}</td>
          <td>${g.ultimo_aggiornamento ? new Date(g.ultimo_aggiornamento).toLocaleDateString("it-IT") : ""}</td>
        </tr>
      `).join("");
    }
  },
};