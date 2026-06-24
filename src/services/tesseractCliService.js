const { execFileSync } = require("child_process");
const os = require("os");
const fs = require("fs");

function findTesseract() {
  if (os.platform() === "win32") {
    const paths = [
      "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const out = execFileSync("where", ["tesseract"], { stdio: "pipe", encoding: "utf8" }).trim();
      if (out) return out.split("\n")[0].trim();
    } catch (e) {}
    return "tesseract";
  }
  try {
    const out = execFileSync("which", ["tesseract"], { stdio: "pipe", encoding: "utf8" }).trim();
    if (out) return out;
  } catch (e) {}
  return "tesseract";
}

class TesseractCliService {
  async recognize(imagePath, lang = "ita") {
    const bin = findTesseract();
    const stdout = execFileSync(bin, [imagePath, "stdout", "-l", lang, "--psm", "6"], {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }
}
module.exports = new TesseractCliService();