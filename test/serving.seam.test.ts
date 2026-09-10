// HTTP serving seam (spec, Testing Decisions seam #2): request → response.
// Everything page-shaped is assertable here without a browser: 200/404 per
// route class, served bytes carrying no executable scripts and no tracker
// residue, links rewritten, closing tags restored.
// The server under test is the production build (next start) serving the
// fixture pipeline output — see seam-global-setup.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      if (/data-flock-parody=/i.test(tag)) continue; // the injected story-hook runtime — own describe below
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
    expect(homeBody).not.toContain('analytics.example.com');
  });

  it('resolves internal links to Recreation routes and leaves external links live', () => {
    expect(homeBody).toContain('href="/products/gun-detection"');
    expect(homeBody).toContain('href="https://x.com/flocksafety"');
    // the intentionally kept footer link — site content under the link policy:
    // the link text survives and the href still targets the privacy portal
    expect(homeBody).toContain('Your Privacy Choices');
    const portal = homeBody.indexOf('privacyportal');
    expect(portal).toBeGreaterThan(-1);
    expect(homeBody.slice(portal, portal + 40)).toContain('/webform/');
  });

  it('has the closing tags the truncated capture lacked', () => {
    expect(homeBody.trimEnd().endsWith('</body></html>')).toBe(true);
  });
});

describe('forms & mock routes (ticket 02)', () => {
  let demo: Response;
  let demoBody: string;

  beforeAll(async () => {
    demo = await fetch(base + '/book-a-demo');
    demoBody = await demo.text();
  });

  it('serves the form page with the injected local POST action on the main-flow form', async () => {
    expect(demo.status).toBe(200);
    expect(demoBody).toContain('action="/api/forms/book-a-demo/mktoForm_1009" method="post" id=mktoForm_1009');
    // Marketo forms render fully styled from the Capture's own stylesheets
    expect(demoBody).toContain('<style id=mktoForms2BaseStyle nonce>');
    expect(demoBody).toContain('background-color:#3FC919!important');
  });

  it('keeps hidden clones and filter forms inert — no action injected', () => {
    for (const tag of demoBody.match(/<form\b[^>]*>/gi) ?? []) {
      if (tag.includes('id=mktoForm_1009')) continue; // the routed main-flow form
      expect(tag).not.toMatch(/\baction\s*=/i);
    }
    expect(demoBody).toContain('visibility:hidden;position:absolute;top:-500px;left:-1000px');
    expect(demoBody).toContain('fs-cmsfilter-element=filters');
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
    expect(await res.text()).toContain('Thank You | Flock Safety');
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

describe('story-hook seam present & dormant on served pages (ticket 03)', () => {
  // the same source the DOM seam tests drive — the build inlines it verbatim
  const RUNTIME = readFileSync(path.join(HERE, '../pipeline/story-hook.js'), 'utf8');

  function assertSeamAboard(body: string, label: string) {
    const open = '<script data-flock-parody="story-hook">';
    const start = body.indexOf(open);
    expect(start, label).toBeGreaterThan(-1);
    const end = body.indexOf('</script>', start);
    // verbatim: the served bytes carry the exact runtime file, marked
    expect(body.slice(start, end), label).toContain(RUNTIME);
    // dormant: outside the runtime's own definition, no byte in the page
    // (i.e. nothing capture-derived) references the seam — nothing calls it
    const outside = body.slice(0, start) + body.slice(end);
    expect(outside, label).not.toContain('flockParody');
    // DOM-only over the wire: the served runtime source references no
    // network primitive (zero-outbound invariant)
    expect(body.slice(start, end), label).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|\bimport\s*\(/);
  }

  it('rides inline on the homepage', () => {
    assertSeamAboard(homeBody, '/');
  });

  it('rides inline on every other served page too', async () => {
    for (const route of ['/products/gun-detection', '/book-a-demo', '/thank-you']) {
      const res = await fetch(base + route);
      expect(res.status, route).toBe(200);
      assertSeamAboard(await res.text(), route);
    }
  });
});

describe('route classes (ticket 07: redirect manifest, dead roots, dropped pages)', () => {
  it('permanently redirects a legacy stub to its local target (301)', async () => {
    const res = await fetch(base + '/legal/privacy-notice', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/thank-you');
    // local target: following it serves the captured page
    const followed = await fetch(base + '/legal/privacy-notice');
    expect(followed.status).toBe(200);
    expect(await followed.text()).toContain('Thank You | Flock Safety');
  });

  it('does not redirect a served path that also exists in the manifest — the served tree wins', async () => {
    const res = await fetch(base + '/thank-you', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it('404s dead collection roots — the live site 404s them', async () => {
    expect((await fetch(base + '/ebooks', { redirect: 'manual' })).status).toBe(404);
  });

  it('404s auth-gated stubs (not captured, not served)', async () => {
    expect((await fetch(base + '/events/test-event', { redirect: 'manual' })).status).toBe(404);
  });

  it('drops scaffold/test pages from serving entirely — 404, no captured body', async () => {
    const res = await fetch(base + '/form-test', { redirect: 'manual' });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Form Test');
  });

  it('builds the redirect table from the run manifest — no table means no redirects', async () => {
    // the table the running server reads is the fixture build's own output
    const table = JSON.parse(readFileSync(path.join(ROOT, '.tmp/seam/served/redirects.json'), 'utf8')) as Record<string, string>;
    expect(table).toEqual({ '/legal/privacy-notice': '/thank-you' });
  });
});

describe('path resolution', () => {
  it('serves deep paths from the mirrored tree', async () => {
    const res = await fetch(base + '/products/gun-detection');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('Gun Detection | Flock Safety');
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
