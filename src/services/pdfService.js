const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const POPPLER_PATH = "C:\\poppler-26.02.0\\Library\\bin";

class PdfService {
  async convertToImages(pdfPath, dpi = 300) {
    const pdfName = path.basename(pdfPath, path.extname(pdfPath));
    const pageDir = path.join(__dirname, "../../uploads/temp_images", pdfName + "_" + Date.now());
    fs.mkdirSync(pageDir, { recursive: true });

    const outputPrefix = path.join(pageDir, "page");
    const cmd = `"${POPPLER_PATH}\\pdftoppm.exe" -r ${dpi} -png "${pdfPath}" "${outputPrefix}"`;

    try {
      execSync(cmd, { timeout: 120000 });
    } catch (e) {
      throw new Error("Errore conversione PDF: " + e.message);
    }

    const images = fs
      .readdirSync(pageDir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(pageDir, f));

    if (images.length === 0) {
      throw new Error("Nessuna immagine generata dal PDF");
    }

    return { images, pageDir };
  }

  cleanup(pageDir) {
    try {
      if (fs.existsSync(pageDir)) {
        const files = fs.readdirSync(pageDir);
        files.forEach((f) => {
          try {
            fs.unlinkSync(path.join(pageDir, f));
          } catch (e) {}
        });
        fs.rmdirSync(pageDir);
      }
    } catch (e) {}
  }
}

module.exports = new PdfService();