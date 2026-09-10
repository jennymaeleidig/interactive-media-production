// Pipeline tests at the pre-agreed seam (spec, Testing Decisions #2 module):
// the build pipeline as a pure transformation — capture run in, served tree +
// mutation log out, with the strip audit as an invariant.
// Fixtures: test/fixtures/capture-run/ — a miniature SingleFile capture run
// mirroring the real corpus (unquoted attrs, Qualified machinery, OneTrust
// stack, truncated tail).
import { describe, it, expect, beforeAll } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type LogEntry } from '../pipeline/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/capture-run');
const OUT = path.join(HERE, '.tmp/pipeline/served');

let result: { log: LogEntry[] };

beforeAll(async () => {
  await rm(path.join(HERE, '.tmp/pipeline'), { recursive: true, force: true });
  result = await runPipeline({
    runDir: FIXTURES,
    pages: ['/', '/products/gun-detection', '/missing'],
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
    expect((html.match(/<script\b/gi) ?? []).length).toBe(2);
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
  });

  it('strips executable scripts outright — only application/ld+json data blocks survive', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('analytics.example.com');
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
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

describe('write pass & mutation log', () => {
  it('restores the closing tags SingleFile truncates away', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html.trimEnd().endsWith('</body></html>')).toBe(true);
  });

  it('logs every mutation per page', () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    const stripped = home.stripped!;
    expect(home.bytesIn!).toBeGreaterThan(home.bytesOut!);
    // strip mutations: per-target removed-byte counts
    expect(stripped['qualified-offer-host']).toBeGreaterThan(0);
    expect(stripped['q-root (chat launcher)']).toBeGreaterThan(0);
    expect(stripped['onetrust-banner-sdk']).toBeGreaterThan(0);
    expect(stripped['qualified header-height var']).toBe(1);
    expect(stripped['qualified header-shift attrs']).toBe(1);
    expect(home.linksRewritten).toBe(4); // 4 internal nav links; the offer-host link was stripped with its subtree
    expect(home.restored).toEqual(['</body></html> (capture was truncated)']);
    // invariants on the served bytes
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, 'known trackers': 0 });
    expect(home.scripts).toEqual({ total: 2, executable: 0, ldJson: 2 });
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
    expect(result.log.filter((e) => !e.error)).toHaveLength(2);
  });
});
