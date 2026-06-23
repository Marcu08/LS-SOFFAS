const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

function findPdftoppm() {
  if (os.platform() === "win32") {
    const winPath = "C:\\poppler-26.02.0\\Library\\bin\\pdftoppm.exe";
    if (fs.existsSync(winPath)) return `"${winPath}"`;
    const which = execSync("where pdftoppm 2>nul", { stdio: "pipe", encoding: "utf8" }).trim();
    if (which) return which;
    throw new Error("pdftoppm non trovato su Windows. Installa poppler in C:\\poppler-..");
  }
  try {
    const out = execSync("which pdftoppm 2>/dev/null || command -v pdftoppm 2>/dev/null", { stdio: "pipe", encoding: "utf8" }).trim();
    if (out) return out;
  } catch (e) {}
  const linuxCandidates = ["/usr/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/opt/bin/pdftoppm"];
  for (const c of linuxCandidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("pdftoppm non trovato. Su Render aggiungi: apt-get install -y poppler-utils");
}

class PdfService {
  async convertToImages(pdfPath, dpi = 200) {
    const pdfName = path.basename(pdfPath, path.extname(pdfPath));
    const pageDir = path.join(__dirname, "../../uploads/temp_images", pdfName + "_" + Date.now());
    fs.mkdirSync(pageDir, { recursive: true });
    const outputPrefix = path.join(pageDir, "page");
    const pdftoppm = findPdftoppm();
    const cmd = `${pdftoppm} -r ${dpi} -jpeg "${pdfPath}" "${outputPrefix}"`;
    try {
      execSync(cmd, { timeout: 120000, stdio: "pipe" });
    } catch (e) { throw new Error("Errore conversione PDF: " + e.message); }
    const images = fs.readdirSync(pageDir).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(pageDir, f));
    if (images.length === 0) throw new Error("Nessuna immagine generata dal PDF");
    return { images, pageDir };
  }
  cleanup(pageDir) {
    try { if (fs.existsSync(pageDir)) { fs.readdirSync(pageDir).forEach((f) => { try { fs.unlinkSync(path.join(pageDir, f)); } catch (e) {} }); fs.rmdirSync(pageDir); } } catch (e) {}
  }
}
module.exports = new PdfService();
