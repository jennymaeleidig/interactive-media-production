// Throwaway capture rig — flock-parody ticket 06 (Qualified conversation UX).
// Run inside mcr.microsoft.com/playwright:v1.63.0-noble with /work = evidence dir.
// Usage: node capture06.mjs <sessionId> <width> <height> [walk|banner|demo]
// Ground rules: never fill/submit real forms; neutral chat text only; no cookie dumps.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const OUT = '/work';
const [sid, Ws, Hs, modeArg] = process.argv.slice(2);
const W = parseInt(Ws, 10), H = parseInt(Hs, 10);
const mode = modeArg || 'walk';
const T0 = Date.now();
let diagDumped = false;
const el = () => Math.round((Date.now() - T0) / 1000);

const netlog = [], wsframes = [], rectlog = [], steps = [], wsEvents = [];
let shotN = 0;

const save = (name, data) => {
  const p = path.join(OUT, `${sid}-${name}`);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  console.log(`[save] ${p} (${el()}s)`);
};
const log = (m) => { steps.push({ t: el(), m }); console.log(`[${el()}s] ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function clipFor(st) {
  const f = st && st.frame;
  if (f && (f.w > 520 || (f.x + f.w / 2) < W / 2)) {
    const width = Math.min(Math.ceil(f.w) + 80, W);
    return { x: Math.max(0, Math.floor(f.x) - 40), y: 0, width, height: Math.min(H, Math.ceil(f.h) + 100) };
  }
  const width = Math.min(560, W), height = Math.min(680, H);
  return { x: W - width, y: H - height, width, height };
}
async function shot(page, st, name, full = false) {
  shotN += 1;
  const n = String(shotN).padStart(2, '0');
  const p = path.join(OUT, `${sid}-${n}-${name}.png`);
  try {
    if (full) await page.screenshot({ path: p });
    else await page.screenshot({ path: p, clip: clipFor(st) });
    console.log(`[shot] ${p} (${el()}s)`);
  } catch (e) { log(`shot failed ${name}: ${e.message.slice(0, 80)}`); }
  return p;
}

// --- page-evaluate snippets (self-contained) ---
const QSTATE = `() => {
  const deepFind = (sel, startEl) => {
    let frontier = [startEl];
    for (let depth = 0; depth < 10 && frontier.length; depth++) {
      const next = [];
      for (const r of frontier) {
        let hit = null;
        try { hit = r.querySelector(sel); } catch (e) {}
        if (hit) return hit;
        let kids = [];
        if (r.querySelectorAll) { try { kids = r.querySelectorAll('*'); } catch (e) {} }
        for (const k of kids) if (k.shadowRoot) next.push(k.shadowRoot);
      }
      frontier = next;
    }
    return null;
  };
  const out = { frame: null, dock: null, offerHosts: 0, htmlShift: null };
  const host = document.getElementById('qualified-multimodal-host') || document.querySelector('[data-q-host]');
  if (!host) return out;
  const cs = getComputedStyle(host);
  out.dock = cs.getPropertyValue('--q-docked-right-offset').trim();
  out.hostRect = (r => [r.x|0, r.y|0, Math.round(r.width), Math.round(r.height)])(host.getBoundingClientRect());
  out.offerHosts = document.querySelectorAll('[data-qualified-offer-host-location]').length;
  const frame = deepFind('#q-messenger-frame', document.documentElement);
  if (frame) {
    const r = frame.getBoundingClientRect();
    out.frame = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), style: frame.getAttribute('style') };
  } else {
    out.noFrameDiag = { iframes: [...document.querySelectorAll('iframe')].map((f) => f.id || (f.src || '').slice(0, 50)) };
  }
  out.htmlShift = document.documentElement.style.cssText || null;
  return out;
}`;

const CONVO = `() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return [r.x|0, r.y|0, Math.round(r.width), Math.round(r.height)]; };
  const styleOf = (e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, radius: c.borderRadius, padding: c.padding, margin: c.margin, font: c.fontFamily.slice(0, 60), size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight, shadow: c.boxShadow.slice(0, 140), maxw: c.maxWidth, align: c.alignSelf, ta: c.textAlign }; };
  const msgEls = [...document.querySelectorAll('div[class*="message" i], div[class*="own" i]')].filter((e) => vis(e) && (e.innerText || '').trim() && !e.querySelector('textarea'));
  const seen = new Set();
  const msgs = [];
  for (const e of msgEls) {
    const key = String(e.className) + '|' + (e.innerText || '').slice(0, 60);
    if (seen.has(key)) continue;
    let nested = false;
    for (const o of msgEls) if (o !== e && o.contains(e) && (o.innerText || '').trim() === (e.innerText || '').trim()) { nested = true; break; }
    if (nested) continue;
    seen.add(key); msgs.push(e);
  }
  const msgsOut = msgs.slice(0, 16).map((e) => ({ cls: String(e.className).slice(0, 140), aria: e.getAttribute('aria-label') ? e.getAttribute('aria-label').slice(0, 90) : null, text: (e.innerText || '').slice(0, 400), rect: rectOf(e), style: styleOf(e) }));
  const btns = [...document.querySelectorAll('button,[role="button"]')].filter(vis).map((e) => ({ cls: String(e.className).slice(0, 110), aria: e.getAttribute('aria-label'), text: (e.innerText || '').slice(0, 80), rect: rectOf(e) }));
  const ta = document.querySelector('textarea');
  const anims = document.getAnimations().map((a) => { let name = '', owner = ''; try { name = a.animationName || (('transition:' + (a.transitionProperty || '')) ); owner = ((a.effect && a.effect.target && a.effect.target.outerHTML) || '').slice(0, 220); } catch (err) {} return { name, owner }; }).filter((a) => a.name);
  let header = null;
  const hEl = document.querySelector('header') || document.querySelector('[class*="header" i]');
  if (hEl && vis(hEl)) header = { text: (hEl.innerText || '').slice(0, 140), style: styleOf(hEl) };
  let theme = {};
  const themeEl = document.querySelector('[style*="--THEME"]');
  if (themeEl) { const c = getComputedStyle(themeEl); for (const p of c) if (p.startsWith('--')) theme[p] = c.getPropertyValue(p).trim(); }
  let keyframes = [];
  for (const sheet of document.styleSheets) {
    let rules = null; try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const r of rules) if (r.type === CSSRule.KEYFRAMES_RULE && /q-|flipDot|pulse|dot/i.test(r.name)) keyframes.push({ name: r.name, css: r.cssText.slice(0, 700) });
  }
  return { title: document.title, url: location.href.slice(0, 120), msgs: msgsOut, btns, ta: ta ? { ph: ta.placeholder, val: ta.value.slice(0, 100), rect: rectOf(ta), focused: document.activeElement === ta } : null, anims, header, theme, keyframes };
}`;

const BANNER_PROBE = `() => {
  const hosts = [...document.querySelectorAll('[data-qualified-offer-host-location]')];
  return hosts.map((h) => { const r = h.getBoundingClientRect(); let inner = null; let cta = null; let dismiss = null;
    const sr = h.shadowRoot;
    if (sr) { inner = sr.innerHTML.slice(0, 5000);
      const a = sr.querySelector('a'); if (a) cta = { href: a.href, text: (a.innerText || '').slice(0, 60) };
      const btns = [...sr.querySelectorAll('button,[role="button"],[class*="close" i],[aria-label]')];
      for (const b of btns) { const al = (b.getAttribute('aria-label') || '') + ' ' + b.className; if (/dis|close|\\bx\\b|×/i.test(al)) dismiss = { aria: b.getAttribute('aria-label'), cls: String(b.className).slice(0, 80) }; }
    }
    return { loc: h.getAttribute('data-qualified-offer-host-location'), rect: [r.x|0, r.y|0, Math.round(r.width), Math.round(r.height)], cta, dismiss, inner }; });
}`;

function saveFinal() {
  save('log.json', steps);
  save('rects.json', rectlog);
  save('network.json', netlog);
  save('wsframes.json', wsframes.slice(0, 600));
  save('ws-events.json', wsEvents);
  const init = wsEvents.find((e) => e.event === 'initState');
  if (init) save('init-state.json', init.payload);
  const pounces = wsEvents.filter((e) => e.event === 'message' && e.payload && e.payload.apForArComposer);
  if (pounces.length) save('pounce-events.json', pounces);
}

async function main() {
  const pushRect = (tag) => async () => {
    const st = await page.evaluate('(' + QSTATE + ')()').catch(() => null);
    if (st) rectlog.push({ t: el(), tag, ...st });
    return st;
  };
  const mFrame = () => page.frames().find((f) => /app\.qualified\.com\/w\/1\//.test(f.url()));
  const waitFrame = async (secs) => {
    for (let i = 0; i < secs * 2; i++) {
      let f = mFrame();
      if (!f) {
        // fallback: any child frame holding the composer textarea
        for (const cand of page.frames()) {
          if (cand === page.mainFrame()) continue;
          const has = await cand.$('textarea').catch(() => null);
          if (has) { f = cand; break; }
        }
      }
      if (f) return f;
      await sleep(500);
    }
    return null;
  };
// --- start ---
const browser = await chromium.launch({ headless: !process.env.HEADED, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=' + W + ',' + (H + 120)] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'en-US', timezoneId: 'America/Los_Angeles',
});
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on('request', (req) => {
  const u = req.url();
  if (/qualified\.com/.test(u)) netlog.push({ t: el(), m: req.method(), u: u.slice(0, 300), post: (req.postData() || '').slice(0, 1800) });
});
page.on('websocket', (ws) => {
  log('ws open: ' + ws.url().slice(0, 110));
  wsframes.push({ t: el(), dir: 'open', url: ws.url().slice(0, 220) });
  const onFrame = (dir) => (d) => {
    const s = String(d.payload);
    wsframes.push({ t: el(), dir, frame: s.slice(0, 3000) });
    try {
      const j = JSON.parse(s);
      const msgs = j.message;
      if (Array.isArray(msgs)) for (const m of msgs) wsEvents.push({ t: el(), dir, event: m.event, payload: m.payload });
    } catch (e) {}
  };
  ws.on('framesent', onFrame('>'));
  ws.on('framereceived', onFrame('<'));
  ws.on('close', () => wsframes.push({ t: el(), dir: 'close' }));
});

const mFrameUnused = null;

await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }, { name: 'Chromium PDF Viewer' }] });
  const gp = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (p) {
    if (p === 37445) return 'Intel Inc.';
    if (p === 37446) return 'Intel Iris OpenGL Engine';
    return gp.call(this, p);
  };
  const gp2 = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (p) {
    if (p === 37445) return 'Intel Inc.';
    if (p === 37446) return 'Intel Iris OpenGL Engine';
    return gp2.call(this, p);
  };
});
try {
  await page.goto('https://flocksafety.com/?utm_source=google&utm_medium=cpc&utm_campaign=brand_search', { waitUntil: 'domcontentloaded', timeout: 60000, referrer: 'https://www.google.com/' });
  await sleep(4000);
  await page.screenshot({ path: path.join(OUT, `${sid}-00-top.png`) });
  log('page loaded');

  // ---- offer banner ----
  let banners = await page.evaluate('(' + BANNER_PROBE + ')()').catch(() => []);
  if (banners.length) {
    log(`offer banner present (${banners.length})`);
    save('banner-probe.json', banners);
    await page.screenshot({ path: path.join(OUT, `${sid}-01-banner.png`), clip: { x: 0, y: 0, width: W, height: Math.min(180, H) } });
    if (mode === 'banner') {
      const host = await page.$('[data-qualified-offer-host-location]');
      if (host) {
        const dismissed = await host.evaluate((h) => {
          const cands = [];
          const collect = (r) => { for (const b of r.querySelectorAll('button,[role="button"],[class*="close" i],[aria-label],a')) cands.push(b); for (const e of r.querySelectorAll('*')) if (e.shadowRoot) collect(e.shadowRoot); };
          collect(h); if (h.shadowRoot) collect(h.shadowRoot);
          let target = null;
          for (const b of cands) { const al = (b.getAttribute('aria-label') || '') + ' ' + b.className + ' ' + (b.id || ''); if (/dis|close|×/i.test(al) && !/read/i.test(al)) target = b; }
          if (!target && cands.length) target = cands[cands.length - 1];
          if (!target) return 'none-found:' + cands.length;
          const info = String(target.className) + '|' + (target.getAttribute('aria-label') || '') + '|' + target.tagName;
          target.click(); return 'clicked:' + info.slice(0, 80);
        });
        log('banner dismiss: ' + dismissed);
        await sleep(1200);
        banners = await page.evaluate('(' + BANNER_PROBE + ')()').catch(() => []);
        save('banner-after-dismiss.json', banners);
        await page.screenshot({ path: path.join(OUT, `${sid}-02-banner-after.png`), clip: { x: 0, y: 0, width: W, height: Math.min(180, H) } });
      }
    }
  } else log('no offer banner this session');

  // ---- wait for pounce or launcher ----
  log(`waiting for pounce (${W}x${H}, mode=${mode})`);
  let st = null, pounced = false, launcher = false;
  while (el() < 150) {
    st = await page.evaluate('(' + QSTATE + ')()').catch(() => null);
    rectlog.push({ t: el(), tag: 'wait', ...(st || {}) });
    if (st && st.frame && st.frame.w >= 200) { pounced = true; break; }
    if (st && st.frame && st.frame.w >= 40 && st.frame.w < 200) {
      // could be mid-pop animation — settle, then classify
      await sleep(1500);
      st = await page.evaluate('(' + QSTATE + ')()').catch(() => null);
      rectlog.push({ t: el(), tag: 'settle-classify', ...(st || {}) });
      if (st && st.frame && st.frame.w >= 200) { pounced = true; break; }
      if (st && st.frame && st.frame.w >= 40) { launcher = true; break; }
      continue;
    }
    const t = el();
    const nudges = [[10, 'mv', 0.3, 0.3], [13, 'wh', 0.5, 0], [16, 'mv', 0.62, 0.5], [21, 'wh', 0.4, 0], [27, 'mv', 0.45, 0.62], [34, 'wh', 0.35, 0], [45, 'wh', -0.6, 0], [58, 'wh', 0.5, 0], [72, 'mv', 0.5, 0.35], [88, 'wh', -0.3, 0], [105, 'mv', 0.35, 0.45], [125, 'wh', 0.25, 0]];
    for (const [nt, kind, a, b] of nudges) if (t >= nt && t < nt + 2) {
      if (kind === 'mv') await page.mouse.move(W * a, H * b);
      else await page.mouse.wheel(0, H * a);
    }
    await sleep(1800);
  }
  // structure diagnostic: once, at t=30, dump messenger host internals
  if (!diagDumped && el() >= 30) {
    diagDumped = true;
    const diag = await page.evaluate(`(() => {
      const host = document.getElementById('qualified-multimodal-host');
      if (!host) return 'no host';
      const describe = (el, d) => {
        if (!el || d > 6) return null;
        const o = { tag: el.tagName, id: el.id || undefined, cls: (el.className && String(el.className).slice(0, 60)) || undefined, shadow: !!el.shadowRoot, kids: [] };
        if (el.shadowRoot) o.shadowHTML = el.shadowRoot.innerHTML.slice(0, 600);
        for (const c of [...el.children].slice(0, 8)) o.kids.push(describe(c, d + 1));
        return o;
      };
      return { iframes: [...document.querySelectorAll('iframe')].map((f) => f.id || f.src.slice(0, 60)), host: describe(host, 0) };
    })()`).catch((e) => 'err:' + e.message.slice(0, 60));
    save('structure-diag.json', diag);
  }
  if (pounced) log('POUNCED (greeting card)');
  else if (launcher) log('LAUNCHER appeared (no pounce)');
  else { log('NO POUNCE within 150s — ending session'); await shot(page, st, 'no-pounce-end'); throw new Error('no pounce'); }

  if (launcher) {
    await shot(page, st, 'launcher');
    const f = st.frame;
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2);
    await sleep(2500);
    st = await pushRect('launcher-clicked')();
    pounced = st && st.frame && st.frame.w >= 200;
    log('after launcher click: ' + (st && st.frame ? `${st.frame.w}x${st.frame.h}` : 'gone'));
  }

  if (pounced) {
    // ---- greeting card ----
    await shot(page, st, 'greeting');
    await sleep(1500);
    st = await pushRect('greeting-settled')();
    let mf = await waitFrame(12);
    if (mf) {
      const g = await mf.evaluate('(' + CONVO + ')()').catch((e) => ({ err: String(e).slice(0, 200) }));
      save('greeting-convo.json', g);
      log(`greeting: ${g.msgs ? g.msgs.length : '?'} msgs, ${g.btns ? g.btns.length : '?'} btns`);
    }

    // ---- demo mode: click Get a Demo, capture, never fill ----
    if (mode === 'demo' && mf) {
      const clicked = await mf.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find((x) => /get a demo/i.test(x.innerText || ''));
        if (b) { b.click(); return 'clicked Get a Demo'; } return 'not-found';
      }).catch((e) => 'err ' + String(e).slice(0, 80));
      log('demo mode: ' + clicked);
      for (let i = 0; i < 5; i++) { await sleep(1600); st = await pushRect('demo-' + i)(); await shot(page, st, 'demo-t' + i); }
      const g2 = mf ? await mf.evaluate('(' + CONVO + ')()').catch(() => null) : null;
      if (g2) save('demo-convo.json', g2);
      save('demo-dom.html', (await mf.evaluate(() => document.body.innerHTML).catch(() => '')).slice(0, 160000));
      log('demo capture done — NOT filling any form');
      return;
    }

    // ---- expand to conversation ----
    const prev = await mf.$('div[class*="message" i]').catch(() => null);
    if (prev) { await prev.click().catch((e) => log('preview click failed: ' + e.message.slice(0, 60))); }
    else { const f = st.frame; await page.mouse.click(f.x + f.w / 2, f.y + f.h * 0.4); }
    for (let i = 0; i < 6; i++) { await sleep(130); await shot(page, null, 'expand-burst' + i); }
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      st = await pushRect('expand')();
      if (st && st.frame && (st.frame.h >= 380 || st.frame.w > 520)) break;
    }
    log(`expanded: ${st && st.frame ? `${st.frame.w}x${st.frame.h} @ ${st.frame.x},${st.frame.y}` : '?'} dock=${st && st.dock}`);
    await sleep(1500);
    st = await pushRect('opened')();
    await shot(page, st, 'opened');
    await shot(page, st, 'opened-full', true);
    mf = await waitFrame(5);
    let convo = mf ? await mf.evaluate('(' + CONVO + ')()').catch(() => null) : null;
    if (convo) {
      save('opened-convo.json', convo);
      save('opened-dom.html', (await mf.evaluate(() => document.body.innerHTML).catch(() => '')).slice(0, 160000));
    }
    if (st && st.frame && st.frame.w > 520) log('SIDEBAR DOCK OBSERVED');
    else log(`opened geometry ${st && st.frame ? st.frame.w + 'x' + st.frame.h : '?'} — still card-form (no sidebar at ${W}x${H})`);

    // ---- send a message; capture user bubble, typing indicator, bot reply (WS-event driven) ----
    const MSG1 = 'What can you help me with?';
    const beforeTexts = new Set((convo ? convo.msgs : []).map((m) => (m.text || '').trim()));
    const taSel = 'textarea';
    // composer focus behavior: focus + partial text first
    try {
      await mf.click(taSel, { timeout: 4000 });
      await mf.type(taSel, 'Hi', { delay: 40 });
      st = await pushRect('composer-focused')();
      await shot(page, st, 'composer-focused');
      const cFocus = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
      if (cFocus) save('composer-focused-convo.json', cFocus);
      await mf.fill(taSel, '');
    } catch (e) { log('composer focus step skipped: ' + e.message.slice(0, 60)); }
    let sentVia = 'none';
    try {
      await mf.fill(taSel, MSG1);
      const sendBtn = await mf.$('button[aria-label="Send"], button[class*="send" i]');
      if (sendBtn) { await sendBtn.click().catch(() => mf.press(taSel, 'Enter')); sentVia = 'button'; }
      else { await mf.press(taSel, 'Enter'); sentVia = 'enter'; }
      log('message sent (' + sentVia + '): ' + MSG1);
    } catch (e) { log('send failed: ' + e.message.slice(0, 100)); }

    const wsMark = wsEvents.length;
    let typingCaptured = false, userBubbleSeen = false, replied = false;
    const deadline = el() + 60;
    while (el() < deadline) {
      await sleep(300);
      const mine = wsEvents.slice(wsMark).find((e) => e.event === 'message' && e.payload && e.payload.isOwn === true && e.payload.type === 'text');
      if (!userBubbleSeen && mine) {
        userBubbleSeen = true;
        const c = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
        if (c) save('user-bubble-convo.json', c);
        save('user-send-dom.html', (await mf.evaluate('(() => document.body.innerHTML)()').catch(() => '')).slice(0, 160000));
        st = await pushRect('user-bubble')(); await shot(page, st, 'user-bubble');
        log('USER bubble confirmed via wire (own text echo)');
      }
      const procStart = wsEvents.slice(wsMark).find((e) => e.event === 'botProcessStarted');
      const c = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
      const typingAnim = c && c.anims.find((a) => /dot|pulse|typing|flip/i.test(a.name || ''));
      if (!typingCaptured && (typingAnim || procStart)) {
        typingCaptured = true; if (c) save('typing-convo.json', c);
        st = await pushRect('typing')(); await shot(page, st, 'typing-indicator');
        log('TYPING captured (anim=' + (typingAnim && typingAnim.name) + ' procStart=' + !!procStart + ')');
      }
      const reply = wsEvents.slice(wsMark).find((e) => e.event === 'message' && e.payload && e.payload.isOwn === false && e.payload.type === 'text' && e.payload.plainText);
      if (reply) {
        replied = true;
        await sleep(3500); // settle for follow-on bubbles / CTA row
        const c2 = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
        save('bot-reply-convo.json', c2 || c);
        save('bot-reply-dom.html', (await mf.evaluate('(() => document.body.innerHTML)()').catch(() => '')).slice(0, 160000));
        st = await pushRect('bot-reply')(); await shot(page, st, 'bot-reply');
        // scroll conversation to top to catch the user bubble styling
        await mf.evaluate(`(() => { const els = [...document.querySelectorAll('*')]; for (const e of els) { const s = getComputedStyle(e); if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 120) { e.scrollTop = 0; return 'scrolled:' + String(e.className).slice(0, 50); } } return 'no-scroller'; })()`).then((r) => log('scroll-to-top: ' + r)).catch(() => {});
        await sleep(600);
        await shot(page, st, 'conversation-top');
        log('BOT REPLY: ' + String(reply.payload.plainText).slice(0, 90));
        break;
      }
    }
    if (!userBubbleSeen) log('user bubble never confirmed');
    if (!typingCaptured) log('no typing indicator observed');
    if (!replied) log('no bot reply within window');

    // ---- quick replies? ----
    const c3 = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
    if (c3) {
      const lastBottom = c3.msgs.length ? Math.max(...c3.msgs.map((m) => m.rect[1] + m.rect[3])) : 0;
      const quick = c3.btns.filter((b) => b.text && b.text.trim() && !/send|close/i.test(b.aria || '') && b.rect[1] > lastBottom - 80 && b.rect[1] < lastBottom + 220);
      save('quick-replies.json', quick);
      log(`quick replies below last message: ${quick.length}${quick.length ? ' -> ' + quick.map((q) => q.text).join(' | ').slice(0, 120) : ''}`);
      if (quick.length) {
        await shot(page, st, 'quick-replies');
        const pick = quick.find((q) => !/demo|book|meet|call/i.test(q.text)) || quick[0];
        log('clicking quick reply: ' + pick.text);
        const clicked = await mf.evaluate((t) => {
          const btns = [...document.querySelectorAll('button,[role="button"]')];
          const b = btns.find((x) => (x.innerText || '').trim() === t);
          if (b) { b.click(); return 'ok'; } return 'not-found';
        }, pick.text.trim()).catch((e) => 'err ' + String(e).slice(0, 60));
        log('quick reply click: ' + clicked);
        const qrDeadline = el() + 40;
        while (el() < qrDeadline) {
          await sleep(1200);
          const newReply = wsEvents.slice(wsMark).filter((e) => e.event === 'message' && e.payload && e.payload.isOwn === false && e.payload.type === 'text' && e.payload.plainText).length;
          if (newReply >= 2) {
            const c4 = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
            if (c4) save('quick-reply-result.json', c4);
            st = await pushRect('quick-reply-result')(); await shot(page, st, 'quick-reply-result');
            log('quick reply produced new messages: ' + (c4 ? c4.msgs.length : '?'));
            break;
          }
        }
      }
    }

    // ---- minimize / re-open / persistence ----
    const preCloseTexts = (await mf.evaluate('(' + CONVO + ')()').catch(() => ({ msgs: [] }))).msgs.map((m) => (m.text || '').trim());
    let closed = false;
    try { await mf.click('button[aria-label="Close messenger"]', { timeout: 4000 }); closed = true; } catch (e) {}
    if (!closed) {
      const f = st && st.frame;
      if (f) { await page.mouse.click(f.x + 40, f.y + 40); closed = true; }
    }
    log('close clicked: ' + closed);
    await sleep(1800);
    st = await pushRect('closed')();
    await shot(page, st, 'closed-launcher');
    log(`after close: ${st && st.frame ? st.frame.w + 'x' + st.frame.h : 'no frame'}`);
    // reopen via launcher (click center of whatever iframe shows)
    if (st && st.frame) {
      await page.mouse.click(st.frame.x + Math.max(20, st.frame.w / 2), st.frame.y + Math.max(20, st.frame.h / 2));
      for (let i = 0; i < 12; i++) {
        await sleep(500);
        st = await pushRect('reopen')();
        if (st && st.frame && st.frame.h >= 340) break;
      }
      await sleep(1200);
      st = await pushRect('reopened')();
      await shot(page, st, 'reopened');
      const c5 = await mf.evaluate('(' + CONVO + ')()').catch(() => null);
      if (c5) {
        save('reopened-convo.json', c5);
        const kept = preCloseTexts.filter((t) => t && c5.msgs.some((m) => (m.text || '').trim().includes(t.slice(0, 60))));
        log(`REOPEN: ${kept.length}/${preCloseTexts.length} prior messages retained`);
      }
    }

    // ---- reload persistence ----
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    log('reloaded — watching for restoration');
    let restored = false;
    const rlDeadline = el() + 80;
    while (el() < rlDeadline) {
      st = await page.evaluate('(' + QSTATE + ')()').catch(() => null);
      rectlog.push({ t: el(), tag: 'reload-wait', ...(st || {}) });
      if (st && st.frame && st.frame.w >= 200) { restored = true; break; }
      await sleep(2000);
    }
    if (restored) {
      await sleep(1500);
      await shot(page, st, 'restored');
      const mf2 = await waitFrame(8);
      const c6 = mf2 ? await mf2.evaluate('(' + CONVO + ')()').catch(() => null) : null;
      if (c6) {
        save('restored-convo.json', c6);
        const kept = preCloseTexts.filter((t) => t && c6.msgs.some((m) => (m.text || '').trim().includes(t.slice(0, 60))));
        log(`RESTORED after reload: ${kept.length}/${preCloseTexts.length} messages retained`);
      }
    } else log('no widget restoration after reload within window');
  }
  } catch (e) {
    log('FATAL: ' + e.message.slice(0, 200) + ' | ' + String(e.stack).split('\n').slice(1, 3).join(' <= '));
  } finally {
    saveFinal();
    await browser.close().catch(() => {});
  }
}

await main();
