// SPDX-License-Identifier: CC0-1.0
// Throwaway probe: measure the Recreation (mimic) widget geometry at one
// viewport, with /api/chat stubbed. Usage:
//   node mimic-probe.mjs <baseUrl> <width> <height> <outDir> <label>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [base, width, height, outDir, label] = process.argv.slice(2);
const W = Number(width);
const H = Number(height);
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
await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().endsWith('/api/chat')) {
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: 's-probe',
        turn: { lines: [{ from: 'bot', text: GREETING }], options: HUB, complete: false },
        state: { node: 'Start', complete: false, vars: {} },
      }),
    });
  } else {
    req.continue();
  }
});

const boxes = {};
async function box(sel) {
  return page
    .$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return {
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        radius: c.borderRadius, bg: c.backgroundColor, position: c.position, z: c.zIndex,
      };
    })
    .catch(() => null);
}

await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await sleep(1200);

// ensure the widget mounted
await page.waitForSelector('.fpc-root', { timeout: 15000 }).catch(() => {});
boxes.viewport = await page.evaluate(() => window.innerWidth + 'x' + window.innerHeight);
boxes.launcher = await box('.fpc-launcher');

// force the pounce
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForSelector('.fpc-surface--card', { timeout: 15000 }).catch(() => {});
await sleep(800);
boxes.card = await box('.fpc-surface--card');
boxes.cardHeader = await box('.fpc-surface--card .fpc-header');
boxes.cardComposer = await box('.fpc-surface--card .fpc-composer');
boxes.cardChip = await box('.fpc-surface--card .fpc-chip');

// open the panel via the greeting preview
await page.click('.fpc-bubble--preview').catch(() => {});
await page.waitForSelector('.fpc-surface--panel', { timeout: 8000 }).catch(() => {});
await sleep(800);
boxes.panel = await box('.fpc-surface--panel');
boxes.panelHeader = await box('.fpc-surface--panel .fpc-header');
boxes.panelComposer = await box('.fpc-surface--panel .fpc-composer');
boxes.panelChip = await box('.fpc-surface--panel .fpc-chip');
boxes.panelFooter = await box('.fpc-surface--panel .fpc-footer');

fs.writeFileSync(`${outDir}/${label}-mimic-boxes.json`, JSON.stringify(boxes, null, 1));
console.log(JSON.stringify(boxes, null, 1));
await browser.close();
