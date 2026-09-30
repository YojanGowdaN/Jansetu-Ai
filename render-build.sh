#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "📦 [1/3] Installing root dependencies..."
npm install

echo "📦 [2/3] Installing WhatsApp Bot dependencies..."
npm --prefix whatsapp-bot install

echo "🌐 [3/3] Installing Chrome for Puppeteer..."
export PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
mkdir -p "$PUPPETEER_CACHE_DIR"
npx --prefix whatsapp-bot puppeteer browsers install chrome

echo "✅ JanSetu AI Build Complete & Ready for Render!"
