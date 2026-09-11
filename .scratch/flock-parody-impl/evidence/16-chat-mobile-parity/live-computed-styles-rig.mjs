// Throwaway probe v9: computed styles of the live mobile widget's key elements.
// Usage: node live-styles.mjs <url> <state: card|panel>
import puppeteer from 'puppeteer-core';

const [url, state = 'panel'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setUserAgent(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const mframe = () => page.frames().find((f) => /qualified\.com/.test(f.url()));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 }).catch((e) => console.log('goto: ' + e.message));
await sleep(3000);
await page.click('#onetrust-accept-btn-handler').catch(() => {});
await sleep(500);
await page.click('.onetrust-close-btn-handler').catch(() => {});
await sleep(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => window.scrollTo(0, 600));
const end = Date.now() + 150000;
while (Date.now() < end) {
  const el = await page.$('#q-messenger-frame');
  const r = el ? await el.boundingBox() : null;
  if (r && r.width > 100 && r.height > 100) break;
  await page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
  await sleep(1500);
}
await sleep(2000);
if (state === 'panel') {
  await mframe().evaluate(() => {
    const b = document.querySelector('[aria-label*="preview" i]') || document.querySelector('.message');
    if (b) b.click();
  });
  await sleep(3000);
}

const styles = await mframe().evaluate((st) => {
  const cs = (el, props) => {
    if (!el) return null;
    const c = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = c[p];
    const r = el.getBoundingClientRect();
    o._box = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    o._text = (el.textContent || '').trim().slice(0, 40);
    return o;
  };
  const byText = (t) => [...document.querySelectorAll('strong,small,span,p,button,footer,div')].find((e) => (e.textContent || '').trim() === t);
  const props = ['fontSize', 'fontWeight', 'lineHeight', 'fontFamily', 'padding', 'margin', 'borderRadius', 'backgroundColor', 'color', 'border', 'textAlign', 'position', 'inset', 'display', 'alignItems', 'justifyContent', 'flexDirection', 'gap'];
  // the panel/card root: the largest white element
  const all = [...document.querySelectorAll('div')].map((d) => ({ d, r: d.getBoundingClientRect() }));
  const biggest = all.filter((x) => getComputedStyle(x.d).backgroundColor === 'rgb(255, 255, 255)').sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
  const out = { state: st, viewport: window.innerWidth + 'x' + window.innerHeight };
  out.surface = biggest ? cs(biggest.d, props) : null;
  out.name = cs(byText('Flock'), props);
  out.role = cs(byText('AI Sales Assistant'), props);
  out.footer = cs(document.querySelector('footer'), props);
  out.ctaDemo = cs([...document.querySelectorAll('button')].find((b) => /get a demo/i.test(b.textContent)), props);
  out.ctaSupport = cs([...document.querySelectorAll('button')].find((b) => /^support$/i.test(b.textContent.trim())), props);
  out.textarea = cs(document.querySelector('textarea'), props);
  out.bubble = cs(document.querySelector('.bot, [class*="isVisitorsPov"]'), props);
  out.divider = cs([...document.querySelectorAll('span')].find((s) => /today,/i.test(s.textContent)), props);
  return out;
}, state);
console.log(JSON.stringify(styles, null, 1));
await browser.close();
