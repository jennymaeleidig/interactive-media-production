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

  it('carries no executable scripts — only application/ld+json data blocks', () => {
    for (const tag of homeBody.match(/<script\b[^>]*>/gi) ?? []) {
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

describe('route classes', () => {
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

  it('does not serve files outside the served tree', async () => {
    const res = await fetch(base + '/%2e%2e/package.json');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('"name"');
  });
});
