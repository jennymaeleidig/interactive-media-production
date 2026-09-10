// CDP-driven screenshot, running INSIDE the container (node 24 has WebSocket):
// launch headless chromium with a debug port, navigate, settle, capture.
//
// Why not --screenshot + --virtual-time-budget (the prototype's method): the
// budget expires on VIRTUAL time while data-URI font/image decode finishes on
// REAL threads — the shot lands in whatever relayout state the race left
// (seen at ticket 06: /chilipiper-2's srcdoc scheduler widget wobbling a few
// px between renders as its embedded fonts and styles settled late).
//
// Determinism here is by construction, in two layers:
//   1. Settle: wait for Page.loadEventFired, then document.fonts.ready +
//      img.decode() for the top document and every accessible iframe (srcdoc
//      embeds share the origin), then a double requestAnimationFrame.
//   2. Convergence: capture repeatedly until two consecutive shots are
//      byte-identical (chromium encodes deterministically — equal bytes mean
//      an unchanged painted frame), and write that frame. A page that never
//      stops changing fails the shot loudly instead of flapping silently —
//      which is the right outcome for an instrument whose 0-px bar rests on
//      the render being steady.
// The control renders (gate.mjs) re-prove determinism end-to-end every run.
//
// Reduced motion is forced at the flag level (see shoot.mjs): the static
// contract is what the gate measures — motion feel is the human
// side-by-side's business at the phase gate.
//
// SPDX-License-Identifier: CC0-1.0
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, outPath, w, h] = process.argv.slice(2);
if (!url || !outPath || !w || !h) {
  console.error('usage: node cdp-shot.mjs <url> <outPath> <width> <height>');
  process.exit(2);
}

// hard watchdog: a hung page kills the shot (and the container dies with it)
setTimeout(() => {
  console.error('cdp-shot: watchdog timeout');
  process.exit(3);
}, 90_000).unref();

// exceptions inside WebSocket event listeners surface as bare crashes —
// report the real error instead
process.on('uncaughtException', (err) => {
  console.error('cdp-shot: uncaught:', err?.stack ?? err);
  process.exit(5);
});

const chrome = spawn('/usr/bin/chromium-browser', [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--force-color-profile=srgb', '--force-device-scale-factor=1',
  '--force-prefers-reduced-motion',
  `--window-size=${w},${h}`,
  '--remote-debugging-port=0',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const browserWsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('devtools endpoint never appeared')), 30_000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) { clearTimeout(t); resolve(m[1]); }
  });
  chrome.on('exit', (code) => reject(new Error(`chromium exited early (${code})`)));
});

// the browser endpoint serves no Page domains — discover the page target's
// own socket from the local /json endpoint
const debugPort = new URL(browserWsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no page target found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('websocket to devtools failed'));
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  let msg;
  try {
    msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  } catch {
    console.error('cdp-shot: unparseable devtools message');
    return;
  }
  if (!msg.id || !pending.has(msg.id)) return; // events are consumed by event() listeners
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(`${msg.error.message} (${methodNames.get(msg.id) ?? 'id ' + msg.id})`));
  else resolve(msg.result);
};
const methodNames = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    methodNames.set(id, method);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const event = (name) =>
  new Promise((resolve) => {
    const handler = (ev) => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (m.method === name) {
        ws.removeEventListener('message', handler);
        resolve(m.params);
      }
    };
    ws.addEventListener('message', handler);
  });

console.error('cdp-shot: devtools connected');
await send('Page.enable');
// the emulated viewport is authoritative for the capture — matches the
// window exactly, as --window-size alone did in the prototype
await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
console.error('cdp-shot: viewport set, navigating');
await send('Page.navigate', { url });
await event('Page.loadEventFired');
console.error('cdp-shot: load fired');

// settle layer 1: fonts + image decode everywhere, then paint
await send('Runtime.enable');
const { exceptionDetails } = await send('Runtime.evaluate', {
  awaitPromise: true,
  expression: `(async () => {
    const docs = [document];
    for (let i = 0; i < docs.length; i++) {
      for (const f of docs[i].querySelectorAll('iframe')) {
        try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) { /* cross-origin — none in this corpus */ }
      }
    }
    const decodeCapped = (img) => Promise.race([
      img.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    await Promise.all(docs.flatMap(async (doc) => {
      await doc.fonts.ready;
      // loading=lazy images below the fold never load (and decode() would
      // wait forever) — excluded; the convergence loop below still holds the
      // final-state guarantee for everything else
      const imgs = [...doc.images].filter((img) => img.loading !== 'lazy');
      await Promise.all(imgs.map(decodeCapped));
    }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`,
});
if (exceptionDetails) {
  console.error('cdp-shot: settle failed: ' + JSON.stringify(exceptionDetails).slice(0, 400));
  process.exit(4);
}

console.error('cdp-shot: settle layer 1 done');
// settle layer 2: capture until the painted frame stops changing
const rafExpr = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
let prev = null;
for (let i = 0; i < 12; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  console.error(`cdp-shot: capture ${i + 1}: ${buf.length} bytes`);
  if (prev !== null && buf.equals(prev)) {
    writeFileSync(outPath, buf);
    ws.close();
    chrome.kill('SIGKILL');
    process.exit(0);
  }
  prev = buf;
  await send('Runtime.evaluate', { expression: rafExpr, awaitPromise: true });
}
console.error(`cdp-shot: render never stabilized after 12 captures (${url})`);
process.exit(6);
