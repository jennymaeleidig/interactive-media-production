// Throwaway probe: open the live widget panel and report its iframe rect, for
// a given viewport width and UA mode. Usage:
//   node mode-probe.mjs <url> <width> <height> <mobile|desktop>
import puppeteer from 'puppeteer-core';

const [url, width, height, uamode = 'mobile'] = process.argv.slice(2);
const W = Number(width);
const H = Number(height);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
if (uamode === 'mobile') {
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  );
} else {
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  );
}
await page.setViewport({ width: W, height: H, isMobile: uamode === 'mobile', hasTouch: uamode === 'mobile', deviceScaleFactor: 1 });
const mframe = () => page.frames().find((f) => /qualified\.com/.test(f.url()));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }).catch((e) => console.log('goto: ' + e.message));
await sleep(3000);
await page.click('#onetrust-accept-btn-handler').catch(() => {});
await sleep(500);
await page.click('.onetrust-close-btn-handler').catch(() => {});
await sleep(1500);
await page.evaluate(() => window.scrollTo(0, 0));

// wait for the widget to appear; then try scrolling to trigger the pounce
await page.evaluate(() => window.scrollTo(0, 600));
const end = Date.now() + 150000;
let cardR = null;
while (Date.now() < end) {
  const el = await page.$('#q-messenger-frame');
  const r = el ? await el.boundingBox() : null;
  // the card is ~370 wide at any viewport (sidebar card), taller than the launcher
  if (r && r.width > 100 && r.height > 100) { cardR = r; break; }
  await page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
  await sleep(1500);
}
if (!cardR) {
  console.log(JSON.stringify({ W, uamode, error: 'no pounce' }));
  await browser.close();
  process.exit(0);
}
await sleep(2000);
// expand by clicking the greeting preview inside the frame
await mframe().evaluate(() => {
  const b = document.querySelector('[aria-label*="preview" i]') || document.querySelector('.message');
  if (b) b.click();
});
await sleep(3000);
const el = await page.$('#q-messenger-frame');
const panelR = el ? await el.boundingBox() : null;
const inFrame = await mframe()?.evaluate(() => {
  const rects = [...document.querySelectorAll('div')].map((d) => d.getBoundingClientRect());
  const best = rects.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return best ? { x: Math.round(best.x), y: Math.round(best.y), w: Math.round(best.width), h: Math.round(best.height) } : null;
}).catch(() => null);
console.log(JSON.stringify({ W, H, uamode, card: cardR && { w: Math.round(cardR.width), h: Math.round(cardR.height) }, panel: panelR && { x: Math.round(panelR.x), y: Math.round(panelR.y), w: Math.round(panelR.width), h: Math.round(panelR.height) }, inFrame }));
await browser.close();
