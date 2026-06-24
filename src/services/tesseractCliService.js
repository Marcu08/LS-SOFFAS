const { recognize } = require("tesseract.js");

class TesseractNodeService {
  async recognize(imagePath, lang = "ita") {
    const { data } = await recognize(imagePath, lang, {
      logger: (m) => {
        if (m.progress) {
          console.log(`[tesseract.js] ${m.status}: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return data.text.trim();
  }
}
module.exports = new TesseractNodeService();
