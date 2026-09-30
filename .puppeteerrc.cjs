const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so it persists in the project folder on Render
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
