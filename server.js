require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
app.locals.supabase = supabase;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
app.locals.upload = upload;

const fs_cleanup = () => {
  const hrs = 1;
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((f) => {
      const fp = path.join(uploadDir, f);
      fs.stat(fp, (err, st) => {
        if (err) return;
        if (now - st.mtimeMs > hrs * 3600000) fs.unlink(fp, () => {});
      });
    });
  });
};
setInterval(fs_cleanup, 3600000);
fs_cleanup();

app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/documenti", require("./src/routes/documenti"));
app.use("/api/giacenze", require("./src/routes/giacenze"));
app.use("/api/export", require("./src/routes/export"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Errore interno" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gestionale LS SOFFASS - Server avviato su porta ${PORT}`);
});