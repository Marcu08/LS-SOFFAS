const ALLOWED_EMAIL = "marcuccifrancesco0@gmail.com";

const MIDDLEWARE_AUTH = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token mancante" });
  }
  const token = authHeader.split(" ")[1];
  const supabase = req.app.locals.supabase;
  supabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        return res.status(401).json({ error: "Token non valido" });
      }
      if (data.user.email?.toLowerCase() !== ALLOWED_EMAIL) {
        return res.status(403).json({ error: "Accesso non autorizzato" });
      }
      req.user = data.user;
      next();
    })
    .catch((err) => {
      return res
        .status(401)
        .json({ error: "Errore autenticazione: " + err.message });
    });
};

module.exports = MIDDLEWARE_AUTH;