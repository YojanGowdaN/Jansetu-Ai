/**
 * whatsapp-bot/install-chrome.js
 * Programmatic Node.js installer for Chrome browser on Render & Linux containers.
 * - Detects existing system Chrome (e.g. /usr/bin/google-chrome, /usr/bin/chromium)
 * - Automatically purges corrupted / incomplete cached directories before downloading
 * - Downloads compatible Chrome build with automatic fallback
 * - Sets 0755 execute permissions on Linux
 */

const path = require('path');
const fs = require('fs');

const PINNED_CHROME_BUILD = '154.0.8037.92'; // Verified stable for Puppeteer 24 on Linux & Windows

async function ensureChrome() {
  console.log('🔍 [Puppeteer] Verifying Chrome browser binary...');
  try {
    const puppeteer = require('puppeteer');
    const { install, getInstalledBrowsers, Browser, detectBrowserPlatform, resolveBuildId } = require('@puppeteer/browsers');

    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '..', '.cache', 'puppeteer');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 0. Check system-installed Chrome/Chromium on Linux
    if (process.platform === 'linux') {
      const systemPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      ];
      for (const sp of systemPaths) {
        if (fs.existsSync(sp)) {
          console.log(`✅ [Puppeteer] Detected system Chrome binary: ${sp}`);
          return sp;
        }
      }
    }

    // 1. Check if Puppeteer default locator finds Chrome
    try {
      const exe = puppeteer.executablePath();
      if (exe && fs.existsSync(exe)) {
        console.log(`✅ [Puppeteer] Chrome already installed at: ${exe}`);
        return exe;
      }
    } catch (_) {}

    // 2. Check if cacheDir already has any working installed Chrome
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

    // 3. Purge any incomplete/corrupted folders inside cacheDir/chrome
    // This solves the fatal error: "The browser folder (...) exists but the executable (...) is missing"
    const chromeDir = path.join(cacheDir, 'chrome');
    if (fs.existsSync(chromeDir)) {
      try {
        const subdirs = fs.readdirSync(chromeDir);
        for (const sub of subdirs) {
          const fullSub = path.join(chromeDir, sub);
          if (fs.statSync(fullSub).isDirectory()) {
            const hasLinuxExe = fs.existsSync(path.join(fullSub, 'chrome-linux64', 'chrome'));
            const hasWinExe = fs.existsSync(path.join(fullSub, 'chrome-win64', 'chrome.exe'));
            const hasDirectExe = fs.existsSync(path.join(fullSub, 'chrome')) || fs.existsSync(path.join(fullSub, 'chrome.exe'));
            if (!hasLinuxExe && !hasWinExe && !hasDirectExe) {
              console.log(`🧹 [Puppeteer] Purging corrupted/incomplete browser directory: ${fullSub}`);
              fs.rmSync(fullSub, { recursive: true, force: true });
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ [Puppeteer] Cache cleanup notice:', err.message);
      }
    }

    // 4. Download Chrome build for platform
    const platform = detectBrowserPlatform();
    if (!platform) {
      console.warn('⚠️ [Puppeteer] Unsupported platform for automated Chrome download.');
      return null;
    }

    let targetBuild = PINNED_CHROME_BUILD;
    try {
      const resolved = await resolveBuildId(Browser.CHROME, platform, 'stable');
      if (resolved) targetBuild = resolved;
    } catch (_) {}

    console.log(`⬇️ [Puppeteer] Downloading Chrome (${targetBuild}) for platform: ${platform} to ${cacheDir}...`);

    let installed = null;
    try {
      installed = await install({
        browser: Browser.CHROME,
        buildId: targetBuild,
        cacheDir,
        platform,
      });
    } catch (err) {
      console.warn(`⚠️ [Puppeteer] Build ${targetBuild} failed (${err.message}). Retrying fallback build...`);
      try {
        installed = await install({
          browser: Browser.CHROME,
          buildId: '131.0.6778.85',
          cacheDir,
          platform,
        });
      } catch (e2) {
        console.warn(`⚠️ [Puppeteer] Fallback build failed: ${e2.message}`);
      }
    }

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
