const Tesseract = require("tesseract.js");

class TesseractService {
  async recognize(imagePath, lang = "ita") {
    try {
      const { data } = await Tesseract.recognize(imagePath, lang, {
        logger: (m) => {},
      });
      return {
        text: data.text,
        confidence: data.confidence,
        words: data.words,
      };
    } catch (error) {
      console.error("Tesseract error:", error.message);
      return { text: "", confidence: 0, words: [], error: error.message };
    }
  }

  async recognizeAll(imagePaths, lang = "ita") {
    const results = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const result = await this.recognize(imagePaths[i], lang);
      results.push({ page: i + 1, ...result });
    }
    return results;
  }
}

module.exports = new TesseractService();