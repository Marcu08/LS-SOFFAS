#!/usr/bin/env bash
set -e
echo "[render-build] Installing system dependencies..."
APT="apt-get"
if command -v sudo &>/dev/null; then APT="sudo apt-get"; fi
$APT update -qq
$APT install -y -qq poppler-utils
echo "[render-build] Verifying poppler..."
which pdftoppm
pdftoppm -v 2>&1 | head -1
echo "[render-build] Done"
