#!/usr/bin/env bash
# Install system dependencies for Render (OCR + PDF processing)
apt-get update -qq && apt-get install -y -qq poppler-utils tesseract-ocr tesseract-ocr-ita 2>/dev/null || echo "apt non disponibile"
