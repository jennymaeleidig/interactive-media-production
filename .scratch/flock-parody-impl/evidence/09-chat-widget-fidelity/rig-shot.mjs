// Throwaway visual-check rig for ticket 09 (re-pointed at the site-wide mount
// by ticket 10): screenshots the widget surfaces from a served page that
// mounted the launcher — the homepage, whose Capture carried <q-root> — and
// dumps their bounding boxes. Not production code.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2];
const OUT = '/out';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const boxes = {};
async function box(sel) {
  return page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      bg: c.backgroundColor, color: c.color, radius: c.borderRadius, font: c.fontFamily, size: c.fontSize,
    };
  }).catch(() => null);
}

// launcher
boxes.launcher = await box('.fpc-launcher');
await page.screenshot({ path: OUT + '/widget-launcher.png' });

// pounce
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForSelector('.fpc-surface--card', { timeout: 6000 });
await page.waitForTimeout(400);
boxes.card = await box('.fpc-surface--card');
boxes.cardHeader = await box('.fpc-surface--card .fpc-header');
boxes.cardBubble = await box('.fpc-surface--card .fpc-bubble--bot');
boxes.cardComposer = await box('.fpc-surface--card .fpc-composer');
boxes.cardChip = await box('.fpc-surface--card .fpc-chip');
await page.screenshot({ path: OUT + '/widget-card.png' });

// open panel via the greeting preview
await page.click('.fpc-bubble--preview');
await page.waitForSelector('.fpc-surface--panel', { timeout: 6000 });
await page.waitForTimeout(400);
boxes.panel = await box('.fpc-surface--panel');
boxes.panelHeader = await box('.fpc-surface--panel .fpc-header');
boxes.panelDivider = await box('.fpc-surface--panel .fpc-divider');
boxes.panelBubble = await box('.fpc-surface--panel .fpc-bubble--bot');
boxes.panelComposer = await box('.fpc-surface--panel .fpc-composer');
boxes.panelClose = await box('.fpc-surface--panel .fpc-close');
await page.screenshot({ path: OUT + '/widget-panel.png' });

fs.writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
console.log(JSON.stringify(boxes, null, 1));
await browser.close();
