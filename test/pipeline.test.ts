// Pipeline tests at the pre-agreed seam (spec, Testing Decisions #2 module):
// the build pipeline as a pure transformation — capture run in, served tree +
// mutation log out, with the strip audit as an invariant.
// Fixtures: test/fixtures/capture-run/ — a miniature SingleFile capture run
// mirroring the real corpus (unquoted attrs, Qualified machinery, OneTrust
// stack, truncated tail).
import { describe, it, expect, beforeAll } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type LogEntry } from '../pipeline/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/capture-run');
const OUT = path.join(HERE, '.tmp/pipeline/served');
// the runtime the story-hook pass inlines — read here so tests can bound the
// growth it causes and assert its verbatim presence
const RUNTIME = readFileSync(path.join(HERE, '../pipeline/story-hook.js'), 'utf8');

let result: { log: LogEntry[] };

beforeAll(async () => {
  await rm(path.join(HERE, '.tmp/pipeline'), { recursive: true, force: true });
  result = await runPipeline({
    runDir: FIXTURES,
    pages: ['/', '/products/gun-detection', '/book-a-demo', '/thank-you', '/gsx', '/chilipiper-2', '/missing'],
    outDir: OUT,
  });
});

describe('strip pass', () => {
  it('removes the Qualified offer host, chat launcher, focus sentinel, and OneTrust stack', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('_qualified-offer-host-3');
    expect(html).not.toContain('Chat now');
    expect(html).not.toContain('<q-root');
    expect(html).not.toContain('q-launcher');
    expect(html).not.toContain('q-focus-sentinel');
    expect(html).not.toContain('onetrust-banner-sdk');
    expect(html).not.toContain('onetrust-pc-sdk');
    expect(html).not.toContain('onetrust-pc-dark-filter');
    expect(html).not.toContain('onetrust-consent-sdk');
    expect(html).not.toContain('onetrust-accept-btn-handler');
  });

  it('strips Qualified style blocks from <head> (id-targeted and content-keyed) but keeps ordinary site CSS', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('qualified-offer-style-element-3');
    expect(html).not.toContain('--qualified-offer-header-height:52px}.x');
    // ordinary site CSS survives — only Qualified/OneTrust machinery goes
    expect(html).toContain('.footer,#wf-nav{color:#333}');
  });

  it('removes the header-height var from the <html> tag and the smeared shift attributes', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('--qualified-offer-header-height');
    expect(html).not.toContain('qualified-offer-header-shifted-element');
    expect(html).toContain('<html data-wf-domain=www.flocksafety.com lang=en>');
    expect(html).toContain('<div class=page-content>content</div>');
  });

  it('leaves the footer privacy-portal webform link as the only onetrust residue (site content, link policy)', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    // the footer link survives: link text present, href targets the privacy portal
    expect(html).toContain('Your Privacy Choices');
    const portal = html.indexOf('privacyportal');
    expect(portal).toBeGreaterThan(-1);
    expect(html.slice(portal, portal + 40)).toContain('/webform/');
    // no consent-stack machinery may remain (ids, classes, style/script handles);
    // the kept footer link is a bare webform URL and matches none of these
    expect(html).not.toMatch(/onetrust-(?:banner|pc|consent|style|accept|reject|close|privacy|policy|customize|filter)|ot-sdk|ot-sync/i);
  });

  it('leaves non-target content untouched: JSON-LD, data-URI assets, captured from-states, text mentions', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    // 2 captured ld+json data blocks + the one injected story-hook runtime
    expect((html.match(/<script\b/gi) ?? []).length).toBe(3);
    expect(html).toContain('<script type=application/ld+json>{"@context":"https://schema.org","@type":"Organization"}</script>');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('<div class=word style="color:rgb(142,168,184);opacity:0.45">Safety</div>');
    expect(html).toContain('We are flocksafety.com, in text.');
    expect(html).toContain('Flock Safety | Safer Together');
  });

  it('strips the same machinery from deep pages', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    expect(html).not.toContain('_qualified-offer-host-5');
    expect(html).not.toContain('<q-root');
    expect(html).not.toContain('onetrust-banner-sdk');
    expect(html).toContain('Gun Detection | Flock Safety');
    expect(html).toContain('Home');
    // single-quoted attributes are covered by the link policy too
    expect(html).toContain("href='/about'");
  });

  it('strips executable scripts outright — only application/ld+json data blocks survive', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('analytics.example.com');
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
      if (/data-flock-parody=/i.test(tag)) continue; // the injected story-hook runtime — own describe below
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
  });
});

describe('rewrite pass', () => {
  it('rewrites absolute internal hrefs to Recreation routes, preserving fragments and queries', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).toContain('href="/products/gun-detection"');
    expect(html).toContain('href="/products/gun-detection#specs"');
    // the Qualified tracking parameter is kept verbatim — word-for-word bar, inert locally
    expect(html).toContain('href="/book-a-demo?q_offer_info=xyz"');
    expect(html).not.toContain('href="https://www.flocksafety.com');
    expect(html).not.toContain('href=https://www.flocksafety.com');
  });

  it('leaves external links live and non-href text untouched', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).toContain('href="https://x.com/flocksafety"');
    expect(html).toContain('href="https://www.linkedin.com/company/flock-safety/"');
    expect(html).toContain('We are flocksafety.com, in text.');
  });
});

describe('forms pass (ticket 02)', () => {
  it('injects a POST action to the local mock route into the main-flow Marketo form, leaving the rest of the captured tag byte-identical', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).toContain(
      '<form action="/api/forms/book-a-demo/mktoForm_1009" method="post" id=mktoForm_1009 class="mktoForm mktoHasWidth mktoLayoutLeft" novalidate style=font-family:Helvetica,Arial,sans-serif;font-size:13px;color:rgb(51,51,51);width:2531px>'
    );
  });

  it('keeps the captured form fields and submit button verbatim', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).toContain('<input id=FirstName name=FirstName maxlength=20 aria-labelledby="LblFirstName InstructFirstName" type=text class="mktoField mktoTextField mktoHasWidth mktoRequired" aria-required=true style=width:150px value>');
    expect(html).toContain('<input id=Email name=Email maxlength=255');
    expect(html).toContain('<button type=submit class=mktoButton>Submit</button>');
  });

  it('leaves the hidden Marketo clone inert — no action, no method', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).toContain('<form class="mktoForm mktoHasWidth mktoLayoutLeft" novalidate style=font-family:Helvetica,Arial,sans-serif;font-size:13px;color:rgb(51,51,51);visibility:hidden;position:absolute;top:-500px;left:-1000px;width:1265px>');
    expect(html).toContain('id=EmailClone');
  });

  it('leaves the Webflow filter form inert — filter furniture, not a lead form', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).toContain('<form id=wf-form-0 name=wf-form-0 data-name=(0) fs-cmsfilter-element=filters class=filters-wrapper-general aria-label=(0)>');
  });

  it('keeps the scheduler embed and the hidden clone inert (ticket checkbox) — byte-intact, no action anywhere', async () => {
    const html = await readFile(path.join(OUT, 'chilipiper-2.html'), 'utf8');
    // the frozen Chili Piper iframe survives exactly as captured — sandbox,
    // srcdoc and all; the build never routes a non-form
    expect(html).toContain('id=chiliCalFrame width=1200 height=900 style=border:none;max-width:100% sandbox="allow-popups allow-top-navigation-by-user-activation"');
    expect(html).toContain('srcdoc="<!DOCTYPE html><html><head><title>Meet with Flock Safety</title></head><body>');
    // the hidden Marketo clone on the scheduler page stays untouched too
    expect(html).toContain('style=visibility:hidden;position:absolute;top:-500px;left:-1000px;width:1265px>');
    // nothing on the page submits anywhere
    expect(html).not.toMatch(/\baction\s*=/i);
  });

  it('keeps the escaped chat pseudo-form out of the served bytes (stripped with the chat machinery)', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).not.toContain('css-1d6gwie');
  });

  it('renders Marketo forms fully styled from the Capture\'s own stylesheets — no authored mock CSS', async () => {
    const html = await readFile(path.join(OUT, 'book-a-demo.html'), 'utf8');
    expect(html).toContain('<style id=mktoForms2BaseStyle nonce>');
    expect(html).toContain('<style id=mktoForms2ThemeStyle nonce>');
    expect(html).toContain('.mktoForm .mktoButton{margin-top:0!important;width:100%!important;border-radius:3rem!important;background-color:#3FC919!important;color:black!important}');
  });

  it('routes Webflow lead forms too — every served form behaves like the original', async () => {
    const html = await readFile(path.join(OUT, 'gsx.html'), 'utf8');
    expect(html).toContain('<form action="/api/forms/gsx/wf-form-Book-a-Demo" method="post" id=wf-form-Book-a-Demo name=wf-form-Book-a-Demo');
  });

  it('logs form routing per page and leaves formless pages unlogged', () => {
    const demo = result.log.find((e) => e.page === '/book-a-demo');
    if (!demo || demo.error) throw new Error('unreachable: fixture book-a-demo must log cleanly');
    expect(demo.forms).toEqual([
      { key: 'book-a-demo/mktoForm_1009', formId: 'mktoForm_1009', action: '/api/forms/book-a-demo/mktoForm_1009', redirectTo: '/thank-you' },
    ]);
    const gsx = result.log.find((e) => e.page === '/gsx');
    if (!gsx || gsx.error) throw new Error('unreachable: fixture gsx must log cleanly');
    expect(gsx.forms).toEqual([
      { key: 'gsx/wf-form-Book-a-Demo', formId: 'wf-form-Book-a-Demo', action: '/api/forms/gsx/wf-form-Book-a-Demo', redirectTo: '/thank-you' },
    ]);
    expect(result.log.find((e) => e.page === '/')?.forms).toBeUndefined();
  });

  it('writes forms-manifest.json beside the served tree — the mock route\'s redirect table', async () => {
    const manifest = JSON.parse(await readFile(path.join(OUT, 'forms-manifest.json'), 'utf8'));
    expect(manifest['book-a-demo/mktoForm_1009']).toEqual({ page: '/book-a-demo', formId: 'mktoForm_1009', redirectTo: '/thank-you' });
    expect(manifest['gsx/wf-form-Book-a-Demo']).toEqual({ page: '/gsx', formId: 'wf-form-Book-a-Demo', redirectTo: '/thank-you' });
  });

  it('keeps zero-outbound by construction — no served form may carry an external action', async () => {
    for (const page of ['book-a-demo', 'gsx', 'thank-you']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      for (const tag of html.match(/<form\b[^>]*>/gi) ?? []) {
        expect(tag, page).not.toMatch(/\baction\s*=\s*("|')?(?:https?:)?\/\//i);
      }
    }
  });
});

describe('story-hook pass (ticket 03)', () => {
  it('injects the runtime inline, verbatim and marked, on every served page', async () => {
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      expect(html, page).toContain(`<script data-flock-parody="story-hook">\n${RUNTIME}\n</script>`);
    }
  });

  it('places the runtime inside <body>, before the closing tags the write pass restores', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const tag = html.indexOf('<script data-flock-parody="story-hook">');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('logs the injection per page', () => {
    for (const entry of result.log.filter((e) => !e.error)) {
      expect(entry.injected).toEqual(['story-hook seam (inline, dormant)']);
    }
  });

  it('keeps the zero-outbound invariants with the runtime aboard — audit clean, no capture-derived executable', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const census = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(census.filter((t) => /data-flock-parody=/i.test(t))).toHaveLength(1);
    for (const tag of census) {
      if (/data-flock-parody=/i.test(tag)) continue;
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
  });
});

describe('write pass & mutation log', () => {
  it('restores the closing tags SingleFile truncates away', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html.trimEnd().endsWith('</body></html>')).toBe(true);
  });

  it('logs every mutation per page', () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    const stripped = home.stripped!;
    // growth invariant: the injected runtime is the ONLY thing that can grow
    // a page — stripping never adds bytes and the closing-tag restore is
    // constant. (On the real corpus pages still shrink: strip removes ~MB.)
    const growth = home.bytesOut! - home.bytesIn!;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(RUNTIME.length + 100);
    // strip mutations: per-target removed-byte counts
    expect(stripped['qualified-offer-host']).toBeGreaterThan(0);
    expect(stripped['q-root (chat launcher)']).toBeGreaterThan(0);
    expect(stripped['onetrust-banner-sdk']).toBeGreaterThan(0);
    expect(stripped['qualified header-height var']).toBe(1);
    expect(stripped['qualified header-shift attrs']).toBe(1);
    expect(home.linksRewritten).toBe(4); // 4 internal nav links; the offer-host link was stripped with its subtree
    expect(home.restored).toEqual(['</body></html> (capture was truncated)']);
    // invariants on the served bytes
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, 'known trackers': 0, externalFormActions: 0 });
    expect(home.scripts).toEqual({ total: 3, executable: 0, ldJson: 2, injected: 1 });
  });

  it('writes build-log.json alongside the served tree and mirrors deep paths', async () => {
    const logged: LogEntry[] = JSON.parse(await readFile(path.join(OUT, 'build-log.json'), 'utf8'));
    expect(logged.map((e) => e.page)).toContain('/');
    expect(logged.map((e) => e.page)).toContain('/products/gun-detection');
    await expect(readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8')).resolves.toContain('Gun Detection');
  });

  it('logs a missing capture as a per-page error instead of throwing', () => {
    const missing = result.log.find((e) => e.page === '/missing');
    expect(missing).toEqual({ page: '/missing', error: 'capture file missing' });
    expect(result.log.filter((e) => !e.error)).toHaveLength(6);
  });
});
