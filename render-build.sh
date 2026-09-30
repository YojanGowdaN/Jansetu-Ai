#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "📦 [1/3] Installing root dependencies..."
npm install

echo "🌐 [2/2] Installing Chrome for Puppeteer..."
export PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
mkdir -p "$PUPPETEER_CACHE_DIR"
node whatsapp-bot/install-chrome.js

echo "✅ JanSetu AI Build Complete & Ready for Render!"
