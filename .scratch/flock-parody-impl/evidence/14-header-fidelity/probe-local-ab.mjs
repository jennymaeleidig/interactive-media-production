// Local A/B on one element: does the injected restore sheet change it at all?
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
const selector = process.argv[3] || 'a.hero-card.is--2';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate((sel) => {
  const style = document.querySelector('style[data-flock-parody="header-restore"]');
  const els = [...document.querySelectorAll(sel)];
  const first = els[0];
  const read = () => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).display);
  const enabled = read();
  if (style) style.disabled = true;
  void document.body.offsetWidth;
  const disabled = read();
  if (style) style.disabled = false;
  let changed = 0;
  for (let i = 0; i < enabled.length; i++) if (enabled[i] !== disabled[i]) changed += 1;
  return {
    count: els.length,
    className: first ? first.className : null,
    inlineStyle: first ? first.getAttribute('style') : null,
    enabledSample: enabled.slice(0, 4),
    disabledSample: disabled.slice(0, 4),
    changed,
  };
}, selector);
console.log(JSON.stringify(out, null, 1));
await browser.close();
