// Throwaway probe v2: live chat widget mobile states.
// Usage: node live-chat-probe2.mjs <url> <width> <height> <outDir> <label>
// Waits for the pounce card, screenshots it, expands to the panel, then closes
// back to the launcher. Records the iframe rect at each state.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [url, width, height, outDir, label] = process.argv.slice(2);
const W = Number(width);
const H = Number(height);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setUserAgent(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
);
await page.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: `${outDir}/${label}-${name}.png` });

async function frameRect() {
  return page.evaluate(() => {
    const el = document.querySelector('#q-messenger-frame');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
}
async function waitFrame(pred, budgetMs, nudge) {
  const end = Date.now() + budgetMs;
  while (Date.now() < end) {
    const r = await frameRect();
    if (r && pred(r)) return r;
    if (nudge) await page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
    await sleep(1500);
  }
  return null;
}

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }).catch((e) => console.log('goto: ' + e.message));
await sleep(3000);
await page.click('#onetrust-accept-btn-handler').catch(() => {});
await sleep(500);
await page.click('.onetrust-close-btn-handler').catch(() => {});
await sleep(1500);
await page.evaluate(() => window.scrollTo(0, 0));

// trigger the pounce
await page.evaluate(() => window.scrollTo(0, 600));
const card = await waitFrame((r) => r.w > 120 && r.h > 120, 150000, true);
const out = { label, url, card: null, panel: null, launcher: null };
if (!card) {
  out.error = 'no pounce card appeared';
  fs.writeFileSync(`${outDir}/${label}-geometry.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
}
await sleep(3000);
await shot('card');
out.card = card;

// expand: click the greeting text if it is a preview button, else the launcher
const previewClicked = await page.evaluate(() => {
  const cands = [...document.querySelectorAll('#q-messenger-frame')];
  return cands.length;
});
void previewClicked;
// click roughly where the greeting text sits (left side of the card, above the CTAs)
await page.mouse.click(Math.round(card.x + card.w * 0.45), Math.round(card.y + card.h * 0.42));
const panel = await waitFrame((r) => r.w !== card.w || r.h !== card.h, 8000);
await sleep(3000);
await shot('panel');
out.panel = panel || (await frameRect());

// close: the in-iframe close. Screenshot the panel first to locate it by eye,
// then click the top-right of the sheet.
await page.mouse.click(Math.round(card.x + card.w - 26), Math.round((out.panel || card).y + 30));
await sleep(3500);
await shot('after-close');
out.launcher = await frameRect();

fs.writeFileSync(`${outDir}/${label}-geometry.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await browser.close();
