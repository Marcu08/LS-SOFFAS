const Movimenti = {
  data: null,

  async render(el) {
    el.innerHTML = '<p style="text-align:center;padding:40px;color:var(--gray-400);">Caricamento movimenti...</p>';
    try {
      const res = await App.api("/documenti?limit=200");
      const data = await res.json();
      this.data = data.documenti || [];
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
          <div class="card-title" style="margin-bottom:0;">Storico Movimenti</div>
          <span style="font-size:12px;color:var(--gray-500);">${items.length} documenti</span>
        </div>
        <div class="search-bar">
          <input type="text" id="movimenti-search" placeholder="Cerca per bolla, articolo o descrizione...">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline filter-btn active" data-filter="all">Tutti</button>
          <button class="btn btn-sm btn-outline filter-btn" data-filter="ENTRATA">Entrate</button>
          <button class="btn btn-sm btn-outline filter-btn" data-filter="USCITA">Uscite</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Bolla</th>
                <th>Articolo</th>
                <th>Descrizione</th>
                <th>Colli</th>
                <th>Peso</th>
                <th>Pallet</th>
              </tr>
            </thead>
            <tbody id="movimenti-body">
              ${items.length > 0 ? items.map((d) => `
                <tr class="mov-row" data-tipo="${d.tipo}">
                  <td>${App.formatDate(d.data_documento)}</td>
                  <td><span class="badge badge-${d.tipo === "ENTRATA" ? "entrata" : "uscita"}">${d.tipo === "ENTRATA" ? "IN" : "OUT"}</span></td>
                  <td>${d.numero_bolla || ""}</td>
                  <td>${d.codice_articolo || ""}</td>
                  <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.descrizione_articolo || ""}</td>
                  <td>${d.colli || 0}</td>
                  <td>${App.formatNumber(d.peso_totale || d.quantita)}</td>
                  <td>${d.pallet || 0}</td>
                </tr>
              `).join("") : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400);">Nessun movimento registrato</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  attach(el) {
    const search = document.getElementById("movimenti-search");
    if (search) {
      search.addEventListener("input", () => this.filter(search.value));
    }
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.dataset.filter;
        const searchVal = document.getElementById("movimenti-search")?.value || "";
        this.filter(searchVal, filter);
      });
    });
  },

  filter(query, tipo) {
    const term = query.toLowerCase();
    const activeFilter = tipo || document.querySelector(".filter-btn.active")?.dataset?.filter || "all";
    const rows = document.querySelectorAll("#movimenti-body tr.mov-row");
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const rowTipo = row.dataset.tipo;
      const matchesTipo = activeFilter === "all" || rowTipo === activeFilter;
      const matchesSearch = text.includes(term);
      row.style.display = matchesTipo && matchesSearch ? "" : "none";
    });
  },
};