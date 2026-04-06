/**
 * Shared browser launch helper.
 * Uses puppeteer-core + puppeteer-extra + stealth plugin,
 * pointed at system Chrome (no extra browser download needed).
 */

const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
puppeteer.use(stealth);

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 800 });
  return page;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { launchBrowser, newPage, sleep };
