const Auth = {
  render() {
    return `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--primary);padding:20px;">
        <div style="background:white;border-radius:12px;padding:32px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:32px;font-weight:700;color:var(--primary);margin-bottom:4px;">LS SOFFASS</div>
            <div style="font-size:13px;color:var(--gray-500);">WMS - Gestione Magazzino</div>
          </div>
          <div id="auth-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="auth-email" placeholder="nome@esempio.com">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="auth-password" placeholder="••••••••">
            </div>
            <button class="btn btn-primary" id="auth-btn" style="width:100%;margin-top:8px;">Accedi</button>
            <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--gray-500);">
              Non hai un account? <a href="#" id="auth-toggle" style="color:var(--primary);">Registrati</a>
            </p>
            <p id="auth-error" style="color:var(--danger);font-size:13px;text-align:center;margin-top:8px;display:none;"></p>
          </div>
        </div>
      </div>
    `;
  },

  attach() {
    let isLogin = true;
    const email = document.getElementById("auth-email");
    const password = document.getElementById("auth-password");
    const btn = document.getElementById("auth-btn");
    const toggle = document.getElementById("auth-toggle");
    const error = document.getElementById("auth-error");

    const doAuth = async () => {
      error.style.display = "none";
      btn.disabled = true;
      btn.textContent = "Caricamento...";
      try {
        const endpoint = isLogin ? "/auth/login" : "/auth/register";
        const res = await App.api(endpoint, {
          method: "POST",
          body: JSON.stringify({
            email: email.value,
            password: password.value,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          error.textContent = data.error || "Errore";
          error.style.display = "block";
          return;
        }
        if (isLogin) {
          App.saveSession(data.token, data.user, data.expires_at);
          App.showApp();
        } else {
          error.textContent =
            "Registrazione completata! Verifica la tua email per attivare l'account.";
          error.style.color = "var(--success)";
          error.style.display = "block";
          isLogin = true;
          btn.textContent = "Accedi";
          toggle.textContent = "Registrati";
        }
      } catch (e) {
        error.textContent = e.message;
        error.style.display = "block";
      } finally {
        btn.disabled = false;
        if (isLogin) btn.textContent = "Accedi";
        else btn.textContent = "Registrati";
      }
    };

    btn.addEventListener("click", doAuth);
    password.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doAuth();
    });
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      btn.textContent = isLogin ? "Accedi" : "Registrati";
      toggle.textContent = isLogin ? "Registrati" : "Accedi";
      error.style.display = "none";
    });
  },
};