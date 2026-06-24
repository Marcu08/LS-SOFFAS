const API_BASE = "/api";

const App = {
  state: {
    token: null,
    user: null,
    currentPage: "dashboard",
    pages: ["dashboard", "ingresso", "giacenze", "import", "movimenti", "export"],
    pageTitles: {
      dashboard: "Dashboard",
      ingresso: "Nuova Bolla",
      giacenze: "Giacenze",
      import: "Import Excel",
      movimenti: "Movimenti",
      export: "Esporta Dati",
    },
  },

  async init() {
    this.loadSession();
    if (this.state.token) {
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  loadSession() {
    try {
      const saved = localStorage.getItem("ls_session");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.expires_at && s.expires_at * 1000 > Date.now()) {
          this.state.token = s.token;
          this.state.user = s.user;
        } else {
          localStorage.removeItem("ls_session");
        }
      }
    } catch (e) {}
  },

  saveSession(token, user, expires_at) {
    this.state.token = token;
    this.state.user = user;
    localStorage.setItem(
      "ls_session",
      JSON.stringify({ token, user, expires_at })
    );
  },

  clearSession() {
    this.state.token = null;
    this.state.user = null;
    localStorage.removeItem("ls_session");
  },

  async api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.state.token) {
      headers["Authorization"] = "Bearer " + this.state.token;
    }
    const retries = options._retryCount || 0;
    let res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401) {
      this.clearSession();
      this.showLogin();
      throw new Error("Sessione scaduta");
    }
    if (!res.ok && retries < 1) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(API_BASE + path, { ...options, headers, _retryCount: retries + 1 });
    }
    return res;
  },

  async apiFormData(path, formData) {
    const headers = {};
    if (this.state.token) {
      headers["Authorization"] = "Bearer " + this.state.token;
    }
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers,
      body: formData,
    });
    if (res.status === 401) {
      this.clearSession();
      this.showLogin();
      throw new Error("Sessione scaduta");
    }
    return res;
  },

  hideLoading() {
    const el = document.getElementById("loading-screen");
    if (el) el.classList.add("hidden");
  },

  showLogin() {
    this.hideLoading();
    document.getElementById("app").innerHTML = Auth.render();
    Auth.attach();
  },

  showApp() {
    this.hideLoading();
    document.getElementById("app").innerHTML = this.renderLayout();
    this.renderNav();
    this.navigate(this.state.currentPage);
  },

  renderLayout() {
    return `
      <header class="app-header">
        <h1>LS SOFFASS WMS</h1>
        <div class="header-user">
          <span>${this.state.user?.email || "Utente"}</span>
          <button onclick="App.logout()">Esci</button>
        </div>
      </header>
      <nav class="app-nav" id="app-nav"></nav>
      <main class="app-content" id="app-content"></main>
    `;
  },

  renderNav() {
    const nav = document.getElementById("app-nav");
    nav.innerHTML = this.state.pages
      .map(
        (p) =>
          `<button class="nav-btn ${
            p === this.state.currentPage ? "active" : ""
          }" data-page="${p}">${this.state.pageTitles[p]}</button>`
      )
      .join("");
    nav.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.navigate(btn.dataset.page));
    });
  },

  navigate(page) {
    this.state.currentPage = page;
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === page);
    });
    const content = document.getElementById("app-content");
    switch (page) {
      case "dashboard":
        Dashboard.render(content);
        break;
      case "ingresso":
        UploadWizard.render(content);
        break;
      case "giacenze":
        Giacenze.render(content);
        break;
      case "import":
        ImportGiacenze.render(content);
        break;
      case "movimenti":
        Movimenti.render(content);
        break;
      case "export":
        ExportPage.render(content);
        break;
    }
  },

  async logout() {
    try {
      await this.api("/auth/me");
    } catch (e) {}
    this.clearSession();
    this.showLogin();
  },

  toast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT");
  },

  formatNumber(n) {
    if (n == null) return "";
    return Number(n).toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    });
  },
};