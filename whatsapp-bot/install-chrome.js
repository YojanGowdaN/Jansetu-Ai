/**
 * whatsapp-bot/install-chrome.js
 * Programmatic Node.js installer for Chrome browser.
 * Uses @puppeteer/browsers directly — avoids shell permission errors (code 127).
 */

const path = require('path');
const fs = require('fs');

async function ensureChrome() {
  console.log('🔍 [Puppeteer] Verifying Chrome browser binary...');
  try {
    const puppeteer = require('puppeteer');
    const { install, Browser, detectBrowserPlatform, resolveBuildId, BrowserTag } = require('@puppeteer/browsers');

    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    try {
      const exe = puppeteer.executablePath();
      if (exe && fs.existsSync(exe)) {
        console.log(`✅ [Puppeteer] Chrome already installed at: ${exe}`);
        return exe;
      }
    } catch (_) {}

    const platform = detectBrowserPlatform();
    if (!platform) {
      console.warn('⚠️ [Puppeteer] Unsupported platform for automated Chrome download.');
      return null;
    }

    console.log(`⬇️ [Puppeteer] Downloading Chrome for platform: ${platform} to ${cacheDir}...`);
    const buildId = await resolveBuildId(Browser.CHROME, platform, BrowserTag.STABLE);
    console.log(`📦 [Puppeteer] Resolved Chrome build: ${buildId}`);

    const installed = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir,
      platform,
    });

    console.log(`🎉 [Puppeteer] Chrome installed successfully at: ${installed.executablePath}`);
    return installed.executablePath;
  } catch (err) {
    console.warn(`⚠️ [Puppeteer] Browser install note: ${err.message}`);
    return null;
  }
}

if (require.main === module) {
  ensureChrome().then(() => {
    console.log('✨ [Puppeteer] Chrome check finished.');
  }).catch((e) => {
    console.warn('Notice:', e.message);
  });
}

module.exports = { ensureChrome };
