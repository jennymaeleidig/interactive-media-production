// Ticket 14 evidence probe: capture the header's states at one viewport.
// Usage: node navshot.mjs <url> <width> <height> <outDir> <label> [mode]
//   mode = menu (default)  desktop: hover the first trigger
//                          mobile:  tap the hamburger, then the first row
//   mode = takeover        mobile only: tap the hamburger and stop
// Writes <label>-rest / -scrolled / -menu (desktop) or -takeover / -submenu
// (mobile), and prints the measured header state.
import puppeteer from 'puppeteer-core';

const [url, width, height, outDir, label, mode = 'menu'] = process.argv.slice(2);
const W = Number(width);
const H = Number(height);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
await sleep(2000);

const shot = (name) => page.screenshot({ path: `${outDir}/${label}-${name}.png` });

// state 1: at rest, top of page
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(700);
await shot('rest');

// state 2: scrolled past the top (the morph)
await page.evaluate(() => window.scrollTo(0, 700));
await sleep(1000);
await shot('scrolled');

// state 3: back at the top with the menu open
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(900);
if (W < 992) {
  await page.click('.nav__menu-button').catch(() => {});
  await sleep(900);
  if (mode !== 'takeover') {
    // the mobile sub-panel: tap the first accordion row
    const trig = await page.$('.nav__menu.cc-trust .nav__dd-trigger');
    if (trig) { await trig.click().catch(() => {}); await sleep(900); }
  }
  await shot(mode === 'takeover' ? 'takeover' : 'submenu');
} else {
  // live's first .nav__dd is inside the hidden legacy menu, so target the
  // visible one or the hover silently misses
  await page.hover('.nav__menu.cc-trust .nav__dd').catch(() => {});
  await sleep(900);
  await shot('menu');
}

const info = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const header = q('#header') || q('.header-z');
  const bg = q('.header__bg');
  const wr = q('.header-wr');
  const products = [...document.querySelectorAll('.nav__dd.show .nav__dd-products > a')];
  return {
    viewport: window.innerWidth + 'x' + window.innerHeight,
    scrollY: window.scrollY,
    headerClasses: header ? header.className : null,
    bgOpacity: bg ? cs(bg).opacity : null,
    bgColor: bg ? cs(bg).backgroundColor : null,
    bgRadius: bg ? cs(bg).borderTopLeftRadius + ' / ' + cs(bg).borderBottomRightRadius : null,
    wrPosition: wr ? cs(wr).position : null,
    wrTop: wr ? cs(wr).top : null,
    ddShow: document.querySelectorAll('.nav__dd.show').length,
    panelsFilled: [...document.querySelectorAll('.nav__dd-content')].filter((e) => e.innerHTML.length > 0).length,
    // the mobile sub-panel's card layout: live shows the featured card and the
    // all-products card, each 165px, with the middle two display:none
    productCards: products.map((el) => `${cs(el).display}:${Math.round(el.getBoundingClientRect().width)}`),
  };
});
console.log(JSON.stringify({ label, url, ...info }));
await browser.close();
