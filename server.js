require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { supabase, supabaseAdmin } = require("./src/db/supabase");

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.locals.supabase = supabase;
app.locals.supabaseAdmin = supabaseAdmin;

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

const fs_cleanup = async () => {
  try {
    const hrs = 1;
    const files = await fs.promises.readdir(uploadDir).catch(() => []);
    const now = Date.now();

    const { data: activeDocs } = await supabaseAdmin
      .from("documenti_raw")
      .select("pdf_path")
      .not("stato", "in", ["confirmed", "error"])
      .not("pdf_path", "is", null);

    const activePaths = new Set(activeDocs ? activeDocs.map(d => path.resolve(d.pdf_path)) : []);

    for (const f of files) {
      const fp = path.resolve(path.join(uploadDir, f));
      if (activePaths.has(fp)) continue;
      try {
        const st = await fs.promises.stat(fp);
        if (now - st.mtimeMs > hrs * 3600000) await fs.promises.unlink(fp);
      } catch (e) {}
    }
  } catch (e) {
    console.error("[cleanup] Errore:", e.message);
  }
};
setInterval(fs_cleanup, 3600000);
fs_cleanup();

app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/documenti", require("./src/routes/documentiRaw"));
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
  res.status(500).json({ error: "Errore interno del server" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gestionale LS SOFFASS - Server avviato su porta ${PORT}`);
});