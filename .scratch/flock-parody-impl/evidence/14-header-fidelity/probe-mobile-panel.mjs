// Compare the mobile Products sub-panel: report .nav__dd-products children.
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
await sleep(2500);
await page.click('.nav__menu-button').catch(() => {});
await sleep(900);
const trig = await page.$('.nav__menu.cc-trust .nav__dd-trigger');
if (trig) { await trig.click().catch(() => {}); await sleep(1200); }

const out = await page.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const grid = document.querySelector('.nav__dd.show .nav__dd-products') || document.querySelector('.nav__dd-products');
  if (!grid) return { grid: null };
  const kids = [...grid.children].map((c) => ({
    tag: c.tagName,
    cls: c.className.slice(0, 70),
    display: cs(c).display,
    width: Math.round(c.getBoundingClientRect().width),
    flex: cs(c).flex,
    flexBasis: cs(c).flexBasis,
  }));
  return {
    grid: { display: cs(grid).display, flexFlow: cs(grid).flexFlow, width: Math.round(grid.getBoundingClientRect().width) },
    kids,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
