#!/usr/bin/env bash
# Install system dependencies for Render
apt-get update -qq && apt-get install -y -qq poppler-utils 2>/dev/null || echo "apt non disponibile, si userà pdftoppm se in PATH"
