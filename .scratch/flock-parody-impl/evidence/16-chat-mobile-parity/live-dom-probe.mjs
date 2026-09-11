// Throwaway probe v5: in-frame element clicks so state transitions are exact.
// Usage: node live-chat-probe5.mjs <url> <width> <height> <label> <state>
//   state = launcher | card | panel
import puppeteer from 'puppeteer-core';

const [url, width, height, label, state] = process.argv.slice(2);
const W = Number(width);
const H = Number(height);
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
await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700, deviceScaleFactor: 1 });

const mframe = () => page.frames().find((f) => /qualified\.com/.test(f.url()));

async function dump(tag) {
  const frame = mframe();
  if (!frame) return { tag, error: 'no frame' };
  return frame.evaluate((t) => {
    const cs = (el) => getComputedStyle(el);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const els = [];
    const walk = (el) => {
      const r = rect(el);
      const c = cs(el);
      if (r.w > 16 && r.h > 6) {
        els.push({
          tag: el.tagName,
          cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
          rect: r,
          pos: c.position,
          inset: [c.top, c.right, c.bottom, c.left].join(' '),
          bg: c.backgroundColor,
          radius: c.borderRadius,
          z: c.zIndex,
          aria: el.getAttribute('aria-label'),
        });
      }
      for (const child of el.children) walk(child);
    };
    walk(document.documentElement);
    return { tag: t, viewport: window.innerWidth + 'x' + window.innerHeight, els };
  }, tag);
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
const end = Date.now() + 150000;
while (Date.now() < end) {
  const el = await page.$('#q-messenger-frame');
  const r = el ? await el.boundingBox() : null;
  if (r && r.width > 120 && r.height > 120) break;
  await page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
  await sleep(1500);
}
await sleep(2500);

if (state === 'card') {
  console.log(JSON.stringify(await dump('card'), null, 1));
} else {
  // expand to the panel via the in-frame greeting preview
  await mframe().evaluate(() => {
    const b = document.querySelector('[aria-label*="preview" i]') || document.querySelector('.message');
    if (b) b.click();
  });
  await sleep(3000);
  if (state === 'panel') {
    console.log(JSON.stringify(await dump('panel'), null, 1));
  } else {
    // close to the launcher via the in-frame close control
    const closed = await mframe().evaluate(() => {
      const b = document.querySelector('button[aria-label="Close messenger"]') ||
        document.querySelector('.close-button button') || document.querySelector('.close-button');
      if (b) { b.click(); return true; }
      return false;
    });
    await sleep(3500);
    const d = await dump('launcher');
    d.closedViaFrame = closed;
    console.log(JSON.stringify(d, null, 1));
  }
}
await browser.close();
