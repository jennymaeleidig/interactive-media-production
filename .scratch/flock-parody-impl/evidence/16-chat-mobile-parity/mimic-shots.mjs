// SPDX-License-Identifier: CC0-1.0
// Ticket 16 evidence rig (throwaway): screenshot the Recreation's mobile
// widget states at 390x844 and verify the nav-take-over layering.
// Usage: node mimic-shots.mjs <baseUrl> <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [base, outDir] = process.argv.slice(2);
const W = 390;
const H = 844;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

const GREETING =
  'Hey there! I\u2019m Flock, your friendly AI Sales Assistant. What questions do you have about Flock\u2019s offerings today?';
const HUB = [
  { index: 0, text: 'What can you help me with?' },
  { index: 1, text: 'Get a Demo' },
  { index: 2, text: 'Support' },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
let optionTurns = 0;
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().endsWith('/api/chat')) {
    const body = JSON.parse(req.postData() || '{}');
    if (body.type === 'option') optionTurns += 1;
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: 's-evidence',
        turn: {
          lines:
            body.type === 'option'
              ? [
                  { from: 'me', text: 'What can you help me with?' },
                  { from: 'bot', text: 'I can help with our products and services. How can I help you today?' },
                ]
              : [{ from: 'bot', text: GREETING }],
          options: HUB,
          complete: false,
        },
        state: { node: 'Start', complete: false, vars: {} },
      }),
    });
  } else {
    req.continue();
  }
});

const box = async (sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom),
      radius: c.borderRadius, bg: c.backgroundColor, z: c.zIndex, position: c.position,
    };
  }).catch(() => null);

await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.waitForSelector('.fpc-root', { timeout: 15000 });
await sleep(1200);

const boxes = { viewport: await page.evaluate(() => window.innerWidth + 'x' + window.innerHeight) };
boxes.launcher = await box('.fpc-launcher');
await page.screenshot({ path: `${outDir}/ours-mobile-launcher.png` });

// pounce card
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForSelector('.fpc-surface--card', { timeout: 15000 });
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(800);
await page.screenshot({ path: `${outDir}/ours-mobile-card.png` });
boxes.card = await box('.fpc-surface--card');
boxes.cardHeader = await box('.fpc-surface--card .fpc-header');

// expanded panel
await page.click('.fpc-bubble--preview');
await page.waitForSelector('.fpc-surface--panel', { timeout: 8000 });
await sleep(800);
await page.screenshot({ path: `${outDir}/ours-mobile-panel.png` });
boxes.panel = await box('.fpc-surface--panel');
boxes.panelHeader = await box('.fpc-surface--panel .fpc-header');
boxes.panelComposer = await box('.fpc-surface--panel .fpc-composer');
boxes.panelFooter = await box('.fpc-surface--panel .fpc-footer');

// close to the launcher, then open the mobile header take-over
await page.click('.fpc-close');
await page.waitForSelector('.fpc-launcher', { timeout: 5000 });
await sleep(400);
await page.click('.nav__menu-button');
await sleep(900);
await page.screenshot({ path: `${outDir}/ours-mobile-nav-open.png` });
boxes.navOpen = await page.evaluate(() => {
  const hb = document.querySelector('.header__bg');
  const header = document.querySelector('#header') || document.querySelector('.header-z');
  const w = document.querySelector('.fpc-root');
  return {
    headerBgOpen: !!(hb && hb.classList.contains('is-open')),
    headerZ: header ? getComputedStyle(header).zIndex : null,
    headerBgZ: hb ? getComputedStyle(hb).zIndex : null,
    widgetZ: w ? getComputedStyle(w).zIndex : null,
  };
});
boxes.launcherWhileNavOpen = await box('.fpc-launcher');

// click the launcher while the take-over is open: the panel must open over it
const launcherBox = await box('.fpc-launcher');
await page.mouse.click(launcherBox.x + launcherBox.w / 2, launcherBox.y + launcherBox.h / 2);
await page.waitForSelector('.fpc-surface--panel', { timeout: 8000 });
await sleep(800);
await page.screenshot({ path: `${outDir}/ours-mobile-nav-panel.png` });
boxes.panelOpenedOverNav = !!(await page.$('.fpc-surface--panel'));

// and a chip still advances the turn with the nav open
const chip = await page.$('.fpc-chip');
if (chip) {
  await chip.click();
  await sleep(800);
  boxes.chipAdvanced = optionTurns > 0;
  boxes.ownBubble = await page.$eval('.fpc-bubble--me', (el) => el.textContent).catch(() => null);
}
await page.screenshot({ path: `${outDir}/ours-mobile-nav-chip.png` });

fs.writeFileSync(`${outDir}/ours-mobile-boxes.json`, JSON.stringify(boxes, null, 1));
console.log(JSON.stringify(boxes, null, 1));
await browser.close();
