// SPDX-License-Identifier: CC0-1.0
// Ticket 16 evidence: the widget's mobile invariants at 390x844 — no-JS static
// end-state, reduced-motion, and the inert composer / focus behavior.
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

/** A 390x844 page with /api/chat stubbed; returns the page. */
function mobilePage() {
  return browser.newPage().then(async (page) => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/api/chat')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 's-evidence',
            turn: { lines: [{ from: 'bot', text: GREETING }], options: HUB, complete: false },
            state: { node: 'Start', complete: false, vars: {} },
          }),
        });
      } else {
        req.continue();
      }
    });
    return page;
  });
}

/** Load, clear the session, and open the fullscreen mobile panel. */
async function openPanel(page) {
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => localStorage.clear());
  await page.waitForSelector('.fpc-root', { timeout: 15000 });
  await page.click('.fpc-launcher');
  await page.waitForSelector('.fpc-surface--panel', { timeout: 8000 });
  await sleep(400);
}

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
const rm = await mobilePage();
await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await openPanel(rm);
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
    chip: read('.fpc-chip'),
    panelOpen: !!document.querySelector('.fpc-surface--panel'),
  };
});
await rm.close();

// 3. keyboard / focus on mobile: the composer is inert (no text input, no
// second request), the send is aria-disabled, and focus is not trapped
const kb = await mobilePage();
let posts = 0;
kb.on('request', (req) => {
  if (req.method() === 'POST' && req.url().endsWith('/api/chat')) posts += 1;
});
await openPanel(kb);
const shape = await kb.evaluate(() => {
  const panel = document.querySelector('.fpc-surface--panel');
  const send = panel.querySelector('.fpc-send');
  return {
    textInputs: panel.querySelectorAll('input, textarea, [contenteditable="true"]').length,
    sendAriaDisabled: send ? send.getAttribute('aria-disabled') : null,
    focusables: [...panel.querySelectorAll('button, a[href], [tabindex]')].map(
      (el) => el.tagName + '.' + (el.className || '').toString().split(' ')[0],
    ),
  };
});
const postsBefore = posts;
await kb.keyboard.type('hello there');
const tabOrder = [];
await kb.evaluate(() => document.body.focus());
for (let i = 0; i < 8; i += 1) {
  await kb.keyboard.press('Tab');
  tabOrder.push(
    await kb.evaluate(() => {
      const a = document.activeElement;
      return a ? a.tagName + '.' + (a.className || '').toString().split(' ')[0] : null;
    }),
  );
}
// the send button is inert: clicking it must not fire a turn either
await kb.click('.fpc-send').catch(() => {});
await sleep(300);
out.keyboard = {
  ...shape,
  textEntered: await kb.evaluate(() => document.querySelector('.fpc-surface--panel').textContent.includes('hello there')),
  postsOnOpen: postsBefore,
  postsAfterTypingAndSend: posts,
  tabOrder,
  focusLeftWidget: tabOrder.some((s) => !s || !/fpc/i.test(s)),
};
await kb.close();

console.log(JSON.stringify(out, null, 1));
await browser.close();
