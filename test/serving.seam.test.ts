// HTTP serving seam: request → response.
// Everything page-shaped is assertable here without a browser: 200/404/301 per
// route class, served bytes carrying no executable scripts and no tracker
// residue, links rewritten, closing tags restored.
// Whether the bytes a served page ships for our own injected layers still match
// the sources we maintain is NOT here: that is `pipeline/injected-layers.mjs`,
// asserted corpus-wide by `npm run routes` and at the interface seam in
// `test/injected-layers.test.ts`.
// The server under test is the production build (next start) serving the
// committed `served/` tree — the artifact itself, not a fixture — see
// seam-global-setup.ts.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalTarget } from '../pipeline/run-manifest.mjs';
import { isInertSource } from '../pipeline/injected-source.mjs';
import { markedMembers } from '../pipeline/injected-layers.mjs';
import type { ChatResponse } from '../lib/chat-engine';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { base } = JSON.parse(readFileSync(path.join(ROOT, '.tmp/seam/runtime.json'), 'utf8'));

let home: Response;
let homeBody: string;

beforeAll(async () => {
  home = await fetch(base + '/');
  homeBody = await home.text();
});

describe('serving a captured page at its original path', () => {
  it('answers 200 with an html body', () => {
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
  });

  it('serves the page with the third-party machinery stripped', () => {
    expect(homeBody).not.toContain('_qualified-offer-host-3');
    expect(homeBody).not.toContain('<q-root');
    expect(homeBody).not.toContain('q-focus-sentinel');
    expect(homeBody).not.toMatch(/onetrust-(?:banner|pc|consent|style|accept|reject|close|privacy|policy|customize|filter)|ot-sdk|ot-sync/i);
  });

  it('carries no executable capture-derived scripts — only application/ld+json data blocks', () => {
    for (const tag of homeBody.match(/<script\b[^>]*>/gi) ?? []) {
      if (/data-flock-parody=/i.test(tag)) continue; // an injected runtime — the describes below
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
    expect(homeBody).not.toContain('analytics.example.com');
  });

  it('resolves internal links to Recreation routes, leaving nothing pointing at the live host', () => {
    // the rewrite pass turns a capture's internal href into a root-relative
    // Recreation route — a served page must not send a visitor to the live site
    expect(homeBody).not.toMatch(/href="https?:\/\/(?:www\.)?flocksafety\.com/);
    // the intentionally kept footer link — site content under the link policy:
    // the href still targets the privacy portal
    const portal = homeBody.indexOf('privacyportal');
    expect(portal).toBeGreaterThan(-1);
    expect(homeBody.slice(portal, portal + 40)).toContain('/webform/');
  });

  it('has the closing tags the truncated capture lacked', () => {
    expect(homeBody.trimEnd().endsWith('</body></html>')).toBe(true);
  });
});

describe('forms & mock routes', () => {
  let demo: Response;
  let demoBody: string;

  beforeAll(async () => {
    demo = await fetch(base + '/book-a-demo');
    demoBody = await demo.text();
  });

  it('serves the form page with the injected local POST action on the main-flow form', async () => {
    expect(demo.status).toBe(200);
    expect(demoBody).toContain('action="/api/forms/book-a-demo/mktoForm_1009" method="post" id=mktoForm_1009');
    // Marketo forms render fully styled from the Capture's own stylesheets —
    // the base sheet is large enough that the dedupe pass externalised it, so
    // the page links it rather than carrying it inline
    expect(demoBody).toMatch(/<link\b[^>]*id=mktoForms2BaseStyle nonce>/);
    expect(demoBody).toContain('id=mktoForms2ThemeStyle nonce');
  });

  it('keeps hidden clones inert — no action injected outside the routed form', () => {
    for (const tag of demoBody.match(/<form\b[^>]*>/gi) ?? []) {
      if (tag.includes('id=mktoForm_1009')) continue; // the routed main-flow form
      expect(tag).not.toMatch(/\baction\s*=/i);
    }
    expect(demoBody).toContain('visibility:hidden;position:absolute;top:-500px;left:-1000px');
  });

  it('POSTs the submission to the mock route, which swallows it and 303s to the captured thank-you page', async () => {
    const res = await fetch(base + '/api/forms/book-a-demo/mktoForm_1009', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'FirstName=Test&Email=test%40example.com&Company=Acme',
      redirect: 'manual',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/thank-you');
    // swallowed: nothing of the submission comes back
    expect(await res.text()).toBe('');
  });

  it('lands on the captured thank-you page when the redirect is followed', async () => {
    const res = await fetch(base + '/api/forms/book-a-demo/mktoForm_1009', {
      method: 'POST',
      body: 'FirstName=Test',
    });
    expect(res.status).toBe(200);
    expect(res.url).toBe(base + '/thank-you');
    expect(await res.text()).toContain('Thank You for Requesting Your Flock Safety Demo');
  });

  it('404s unknown form keys and 405s non-POST methods on the mock route', async () => {
    expect((await fetch(base + '/api/forms/book-a-demo/mktoForm_9999', { method: 'POST', body: 'x=1' })).status).toBe(404);
    expect((await fetch(base + '/api/forms/no/such/key', { method: 'POST', body: 'x=1' })).status).toBe(404);
    expect((await fetch(base + '/api/forms/book-a-demo/mktoForm_1009')).status).toBe(405);
  });

  it('never lets a submission leave the machine — no external action in any served form', () => {
    for (const tag of demoBody.match(/<form\b[^>]*>/gi) ?? []) {
      expect(tag).not.toMatch(/\baction\s*=\s*("|')?(?:https?:)?\/\//i);
    }
  });
});

describe('story-hook seam present & dormant on served pages', () => {
  async function assertSeamAboard(body: string, label: string) {
    // the page carries the runtime as an external asset, not inline bytes;
    // marker-to-asset resolution is `injected-layers`' job (this file keeps
    // only the HTTP facts)
    const member = markedMembers(body).find((m: { name: string }) => m.name === 'story-hook');
    expect(member, `${label}: story-hook stand-in`).toBeDefined();
    expect(member!.delivery, `${label}: externalised`).toBe('asset');
    expect(member!.ref, `${label}: story-hook asset name`).toBeDefined();
    const res = await fetch(`${base}/assets/${member!.ref}`);
    expect(res.status, `${label} → /assets/${member!.ref}`).toBe(200);
    expect(res.headers.get('content-type'), member!.ref).toContain('javascript');
    const source = await res.text();
    // DOM-only over the wire: the served runtime source references no network
    // primitive (zero-outbound invariant)
    expect(isInertSource(source), label).toBe(true);
  }

  it('ships the seam as a marked stand-in on the homepage', async () => {
    await assertSeamAboard(homeBody, '/');
  });

  it('ships the seam on every other served page too', async () => {
    for (const route of ['/book-a-demo', '/thank-you', '/gsx']) {
      const res = await fetch(base + route);
      expect(res.status, route).toBe(200);
      await assertSeamAboard(await res.text(), route);
    }
  });
});

describe('chat mount over HTTP', () => {
  /** The marked stand-in a page ships for one chat body, fetched from its asset. */
  async function chatSource(body: string, kind: 'style' | 'script'): Promise<string> {
    const want = kind === 'style' ? 'css' : 'js';
    const member = markedMembers(body).find((m: { name: string; kind: string }) => m.name === 'chat' && m.kind === want);
    expect(member, `${kind} chat element`).toBeDefined();
    expect(member!.delivery, `${kind} chat element externalised`).toBe('asset');
    expect(member!.ref, `${kind} chat asset name`).toBeDefined();
    const res = await fetch(`${base}/assets/${member!.ref}`);
    expect(res.status, `/assets/${member!.ref}`).toBe(200);
    expect(res.headers.get('content-type'), member!.ref).toContain(kind === 'style' ? 'css' : 'javascript');
    return res.text();
  }

  it('ships the mimic as a marked stand-in the page points at, not inline bytes', async () => {
    // every served page's Capture mounted the launcher — the corpus has no
    // unmounted page to check the absent branch against
    expect(homeBody).not.toContain('flock-chat-session');
    expect(await chatSource(homeBody, 'style')).toContain('.fpc-root');
    expect(await chatSource(homeBody, 'script')).toContain('/api/chat');
  });

  it('grants the captured CSP exactly the one source the widget POST needs', async () => {
    const meta = /<meta\b[^>]*http-equiv=\s*content-security-policy[^>]*>/i.exec(homeBody)?.[0];
    expect(meta).toBeDefined();
    expect(meta).toContain("connect-src 'self';");
    // the rest of the captured policy is untouched — no third-party source opens up
    expect(meta).toContain("default-src 'none';");
    expect(meta).not.toMatch(/connect-src\s+https?:/);
  });
});

describe('route classes (redirect manifest, dead roots, dropped pages)', () => {
  it('permanently redirects a legacy stub to its local target (301)', async () => {
    const res = await fetch(base + '/legal/privacy-notice', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/legal/privacy-policy');
    // local target: following it serves the captured page
    const followed = await fetch(base + '/legal/privacy-notice');
    expect(followed.status).toBe(200);
  });

  it('does not redirect a served path that also exists in the manifest — the served tree wins', async () => {
    const res = await fetch(base + '/thank-you', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it('404s dead collection roots — the live site 404s them', async () => {
    expect((await fetch(base + '/blog-audiences/community-safety', { redirect: 'manual' })).status).toBe(404);
  });

  it('404s auth-gated stubs (not captured, not served)', async () => {
    expect((await fetch(base + '/events/test-event', { redirect: 'manual' })).status).toBe(404);
  });

  it('drops scaffold/test pages from serving entirely — 404, no captured body', async () => {
    const res = await fetch(base + '/form-test', { redirect: 'manual' });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Form Test');
  });

  it('redirects only to local targets — nothing in the table leaves the machine', () => {
    const table = JSON.parse(readFileSync(path.join(ROOT, 'served/redirects.json'), 'utf8')) as Record<string, string>;
    expect(table['/legal/privacy-notice']).toBe('/legal/privacy-policy');
    expect(Object.keys(table).length).toBeGreaterThan(0);
    for (const [from, to] of Object.entries(table)) {
      expect(isLocalTarget(to), `${from} → ${to}`).toBe(true);
    }
  });
});

describe('path resolution', () => {
  it('serves deep paths from the mirrored tree', async () => {
    const res = await fetch(base + '/products/flock-os');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('FlockOS');
  });

  it('returns 404 for unknown paths, at any depth', async () => {
    expect((await fetch(base + '/nope')).status).toBe(404);
    expect((await fetch(base + '/nope/deeper/still')).status).toBe(404);
  });

  it('does not serve files outside the served tree, including compound and encoded segments', async () => {
    for (const p of ['/%2e%2e/package.json', '/..%2F..%2Fpackage.json', '/a/../../package.json']) {
      const res = await fetch(base + p);
      expect(res.status, p).toBe(404);
      expect(await res.text()).not.toContain('"name"');
    }
  });
});

// The chat message API seam over real HTTP:
// the same assertions as test/chat.seam.test.ts but through the built route,
// proving the POST shell (JSON in, JSON out, 400 on malformed) as well as the
// engine. Conversation shape and pinned copy are locked in the chat-seam
// project; this block covers the transport.
describe('chat message API over HTTP', () => {
  // The turn shape is declared once (`pipeline/chat-turn.mjs`, re-exported by the
  // engine): this seam asserts the transport carries that shape, not a copy of it.
  async function post(body: unknown): Promise<{ status: number; json: ChatResponse }> {
    const res = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as ChatResponse };
  }

  const optionTexts = (json: ChatResponse) => json.turn.options?.map((o) => o.text);

  it('answers start with a turn batch, the choice set, and the session variables', async () => {
    const { status, json } = await post({ type: 'start' });
    expect(status).toBe(200);
    expect(json.turn.lines).toHaveLength(1);
    expect(optionTexts(json)).toEqual(['What can you help me with?', 'Get a Demo', 'Support']);
    expect(json.state.vars).toHaveProperty('demoRequested', false);
  });

  it('persists a live session across a resume and returns the email gate to the hub', async () => {
    const started = await post({ type: 'start' });
    const { sessionId } = started.json;
    const demo = await post({ type: 'option', sessionId, optionIndex: 1 });
    expect(optionTexts(demo.json)).toEqual(['Maybe later']);
    const gate = await post({ type: 'option', sessionId, optionIndex: 0 });
    expect(optionTexts(gate.json)).toEqual(['What can you help me with?', 'Get a Demo', 'Support']);
    expect(gate.json.turn.complete).toBe(false);
    const reloaded = await post({ type: 'resume', sessionId });
    expect(reloaded.json.replay).toHaveLength(4);
  });

  it('rejects a malformed request with 400', async () => {
    expect((await post({ type: 'nope' })).status).toBe(400);
    expect((await post({ type: 'option', sessionId: 'x' })).status).toBe(400);
  });
});
