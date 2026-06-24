const express = require("express");
const router = express.Router();

const ALLOWED_EMAIL = "marcuccifrancesco0@gmail.com";

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e password richieste" });
    }
    if (email.toLowerCase() !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: "Registrazione non consentita per questa email" });
    }
    const supabase = req.app.locals.supabase;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: req.body.full_name || "" } },
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Registrazione completata. Verifica la email.", user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e password richieste" });
    }
    if (email.toLowerCase() !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: "Accesso non autorizzato" });
    }
    const supabase = req.app.locals.supabase;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({
      token: data.session.access_token,
      user: data.user,
      expires_at: data.session.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token mancante" });
  }
  const token = authHeader.split(" ")[1];
  const supabase = req.app.locals.supabase;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: error.message });
  if (!data.user || data.user.email?.toLowerCase() !== ALLOWED_EMAIL) {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  res.json({ user: data.user });
});

module.exports = router;