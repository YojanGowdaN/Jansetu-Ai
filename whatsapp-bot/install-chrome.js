/**
 * whatsapp-bot/install-chrome.js
 * Programmatic Node.js installer for Chrome browser.
 * Directly pins build 146.0.7680.31 (required by Puppeteer 24.x)
 * and verifies execute permissions.
 */

const path = require('path');
const fs = require('fs');

const PINNED_CHROME_BUILD = '146.0.7680.31';

async function ensureChrome() {
  console.log('🔍 [Puppeteer] Verifying Chrome browser binary...');
  try {
    const puppeteer = require('puppeteer');
    const { install, getInstalledBrowsers, Browser, detectBrowserPlatform } = require('@puppeteer/browsers');

    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 1. Check if Puppeteer default locator finds Chrome
    try {
      const exe = puppeteer.executablePath();
      if (exe && fs.existsSync(exe)) {
        console.log(`✅ [Puppeteer] Chrome already installed at: ${exe}`);
        return exe;
      }
    } catch (_) {}

    // 2. Check if cacheDir already has any installed Chrome
    try {
      const installed = await getInstalledBrowsers({ cacheDir });
      const chromeBrowser = installed.find(b => b.browser === 'chrome' && fs.existsSync(b.executablePath));
      if (chromeBrowser) {
        console.log(`✅ [Puppeteer] Found existing Chrome in cache: ${chromeBrowser.executablePath}`);
        if (process.platform !== 'win32') {
          try { fs.chmodSync(chromeBrowser.executablePath, 0o755); } catch (_) {}
        }
        return chromeBrowser.executablePath;
      }
    } catch (_) {}

    // 3. Download the exact pinned build (146.0.7680.31)
    const platform = detectBrowserPlatform();
    if (!platform) {
      console.warn('⚠️ [Puppeteer] Unsupported platform for automated Chrome download.');
      return null;
    }

    console.log(`⬇️ [Puppeteer] Downloading Chrome (${PINNED_CHROME_BUILD}) for platform: ${platform} to ${cacheDir}...`);

    const installed = await install({
      browser: Browser.CHROME,
      buildId: PINNED_CHROME_BUILD,
      cacheDir,
      platform,
    });

    if (installed && installed.executablePath && fs.existsSync(installed.executablePath)) {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(installed.executablePath, 0o755); } catch (_) {}
      }
      console.log(`🎉 [Puppeteer] Chrome installed successfully at: ${installed.executablePath}`);
      return installed.executablePath;
    }

    return null;
  } catch (err) {
    console.warn(`⚠️ [Puppeteer] Browser install note: ${err.message}`);
    return null;
  }
}

if (require.main === module) {
  ensureChrome().then((exe) => {
    console.log(exe ? `✨ [Puppeteer] Ready with Chrome: ${exe}` : '⚠️ [Puppeteer] Finished without executable.');
  }).catch((e) => {
    console.warn('Notice:', e.message);
  });
}

module.exports = { ensureChrome };
