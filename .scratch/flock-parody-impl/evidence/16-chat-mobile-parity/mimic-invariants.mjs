// Ticket 16 evidence: reduced-motion and no-JS invariants at 390x844.
// Usage: node mimic-invariants.mjs <baseUrl>
import puppeteer from 'puppeteer-core';

const [base] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GREETING = 'Hey there! I\u2019m Flock, your friendly AI Sales Assistant. What questions do you have about Flock\u2019s offerings today?';
const HUB = [{ index: 0, text: 'What can you help me with?' }, { index: 1, text: 'Get a Demo' }, { index: 2, text: 'Support' }];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const out = {};

// 1. no-JS: the runtime never runs, so the captured end-state carries no widget
const noJs = await browser.newPage();
await noJs.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await noJs.setJavaScriptEnabled(false);
await noJs.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
out.noJs = await noJs.evaluate(() => ({
  widgetRoot: !!document.querySelector('.fpc-root'),
  launcher: !!document.querySelector('.fpc-launcher'),
  surface: !!document.querySelector('.fpc-surface'),
  chatScript: !!document.querySelector('script[data-flock-parody="chat"]'),
}));
await noJs.close();

// 2. reduced motion: the widget has no motion, so every animated property is
// already 0s; opening the panel still works
const rm = await browser.newPage();
await rm.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await rm.setRequestInterception(true);
rm.on('request', (req) => {
  if (req.method() === 'POST' && req.url().endsWith('/api/chat')) {
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId: 's-rm', turn: { lines: [{ from: 'bot', text: GREETING }], options: HUB, complete: false }, state: { node: 'Start', complete: false, vars: {} } }),
    });
  } else {
    req.continue();
  }
});
await rm.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
await rm.evaluate(() => localStorage.clear());
await rm.waitForSelector('.fpc-root', { timeout: 15000 });
await rm.click('.fpc-launcher');
await rm.waitForSelector('.fpc-surface--panel', { timeout: 8000 });
await sleep(500);
out.reducedMotion = await rm.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = getComputedStyle(el);
    return { transitionDuration: c.transitionDuration, animationDuration: c.animationDuration, animationName: c.animationName };
  };
  return {
    mediaMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    panel: read('.fpc-surface--panel'),
    launcher: read('.fpc-launcher'),
    chip: read('.fpc-chip'),
    panelOpen: !!document.querySelector('.fpc-surface--panel'),
  };
});
await rm.close();

console.log(JSON.stringify(out, null, 1));
await browser.close();
