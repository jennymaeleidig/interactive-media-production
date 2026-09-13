// The captured policy and the grants the build makes to it: one grant
// operation (`applyGrant`), and the invariant that a directive is replaced
// rather than appended to. Pure, so it is pinned here rather than only through
// the site build.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { applyGrant, grantSources, readCsp, writeCsp, writeCspTag } from '../pipeline/csp.mjs';

// The captured value, verbatim from the capture run (test/fixtures).
const CAPTURED = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:; frame-src 'self' data:;";

// The value the served tree carries, verbatim from the frozen artifact: the
// chat mount appended connect-src, and the dedupe pass widened style-src/script-src.
const SERVED = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline' 'self'; media-src 'self' data:; script-src 'unsafe-inline' data: 'self'; object-src 'self' data:; frame-src 'self' data:; connect-src 'self';";

const PAGE = (value: string) =>
  `<!DOCTYPE html><html><head><meta http-equiv=content-security-policy content="${value}"><title>t</title></head><body><p>x</p></body></html>`;

/** How many times a directive appears in a policy value. */
const directives = (value: string, name: string) =>
  (value.match(new RegExp(`(?:^|;)\\s*${name}\\s`, 'gi')) ?? []).length;

describe('readCsp', () => {
  it('returns the meta tag, its position, and the content value', () => {
    const html = PAGE(CAPTURED);
    const csp = readCsp(html);
    expect(csp?.tag).toBe(`<meta http-equiv=content-security-policy content="${CAPTURED}">`);
    expect(csp?.index).toBe(html.indexOf('<meta'));
    expect(csp?.value).toBe(CAPTURED);
  });

  it('returns null when the document carries no policy', () => {
    // defensive: none of the frozen tree's 1,181 pages is in this state, but an
    // unfrozen capture may be.
    expect(readCsp('<html><head></head></html>')).toBeNull();
  });

  it('reports a meta with no content attribute as a null value, not as absent', () => {
    const csp = readCsp('<meta http-equiv=content-security-policy>');
    expect(csp).not.toBeNull();
    expect(csp?.value).toBeNull();
  });
});

describe('writeCsp', () => {
  it('replaces the value in place, keeping the captured quote style', () => {
    const html = PAGE(CAPTURED);
    const out = writeCsp(html, readCsp(html)!, 'default-src \'none\';');
    expect(out).toContain('content="default-src \'none\';"');
    expect(out).not.toContain(CAPTURED);
    // nothing outside the meta moved
    expect(out.replace('content="default-src \'none\';"', `content="${CAPTURED}"`)).toBe(html);
  });

  it('leaves the tag alone when there is no content attribute to write', () => {
    const tag = '<meta http-equiv=content-security-policy>';
    expect(writeCspTag({ tag, raw: null }, 'x')).toBe(tag);
  });
});

describe('grantSources', () => {
  it('appends the directive when the policy has none, ending the value', () => {
    const out = grantSources(CAPTURED, 'connect-src', ["'self'"]);
    expect(out.existed).toBe(false);
    expect(out.value).toBe(`${CAPTURED} connect-src 'self';`);
  });

  it('widens the directive in place, adding only what it does not already name', () => {
    const out = grantSources(CAPTURED, 'frame-src', ['https://a.test', 'https://b.test']);
    expect(out.existed).toBe(true);
    expect(out.added).toEqual(['https://a.test', 'https://b.test']);
    expect(out.value).toBe(CAPTURED.replace("frame-src 'self' data:;", "frame-src 'self' data: https://a.test https://b.test;"));
  });

  it('adds only the missing sources on a second grant', () => {
    const once = grantSources(CAPTURED, 'frame-src', ['https://a.test']);
    const twice = grantSources(once.value, 'frame-src', ['https://a.test', 'https://b.test']);
    expect(twice.added).toEqual(['https://b.test']);
    expect(twice.value).toBe(grantSources(CAPTURED, 'frame-src', ['https://a.test', 'https://b.test']).value);
  });

  it('does nothing when every source is already granted', () => {
    const once = grantSources(CAPTURED, 'frame-src', ['https://a.test']);
    const again = grantSources(once.value, 'frame-src', ['https://a.test']);
    expect(again.added).toEqual([]);
    expect(again.value).toBe(once.value);
  });

  it('leaves the policy untouched when appending is refused and the directive is absent', () => {
    // the dedupe pass's contract: a page with no style-src is governed by
    // `default-src 'none'`, so the caller keeps that body inline instead.
    const out = grantSources(CAPTURED, 'worker-src', ["'self'"], { append: false });
    expect(out.existed).toBe(false);
    expect(out.value).toBe(CAPTURED);
  });

  it('seeds an appended directive with its defaults', () => {
    const out = grantSources("default-src 'none';", 'frame-src', ['https://a.test'], {
      defaults: ["'self'", 'data:', 'https://a.test'],
    });
    expect(out.value).toBe("default-src 'none'; frame-src 'self' data: https://a.test;");
  });

  // The invariant this module exists for: a second directive would intersect
  // with the first and keep the resource blocked, which looks exactly like the
  // grant never having been made.
  it('never produces a second directive, however often it is asked', () => {
    let value = CAPTURED;
    for (let i = 0; i < 3; i += 1) {
      value = grantSources(value, 'frame-src', ['https://a.test', 'https://b.test']).value;
      value = grantSources(value, 'style-src', ["'self'"]).value;
      value = grantSources(value, 'connect-src', ["'self'"]).value;
    }
    for (const name of ['frame-src', 'style-src', 'connect-src']) {
      expect(directives(value, name)).toBe(1);
    }
  });
});

describe('applyGrant', () => {
  const spec = (over: Record<string, unknown> = {}) => ({
    directive: 'connect-src',
    sources: ["'self'"],
    note: 'chat mount',
    missing: 'chat: no CSP meta found — the widget POST may be blocked',
    noContent: 'chat: CSP meta has no content attribute — the widget POST may be blocked',
    ...over,
  });
  const entry = () => ({ warnings: [] as string[], csp: undefined as string | undefined });

  it('widens the policy, writes it, and records the note once', () => {
    const e = entry();
    const out = applyGrant(PAGE(CAPTURED), e, spec());
    expect(readCsp(out)?.value).toBe(`${CAPTURED} connect-src 'self';`);
    expect(e.csp).toBe("connect-src 'self' (chat mount)");
    expect(e.warnings).toEqual([]);
  });

  it('is idempotent — a second grant changes nothing and logs nothing more', () => {
    const e = entry();
    const once = applyGrant(PAGE(CAPTURED), e, spec());
    const twice = applyGrant(once, e, spec());
    expect(twice).toBe(once);
    expect(e.csp).toBe("connect-src 'self' (chat mount)");
  });

  it('warns and leaves the policy when the page carries no meta', () => {
    const e = entry();
    const html = '<html><body></body></html>';
    expect(applyGrant(html, e, spec())).toBe(html);
    expect(e.warnings).toEqual(['chat: no CSP meta found — the widget POST may be blocked']);
    expect(e.csp).toBeUndefined();
  });

  it('warns and leaves the policy when the meta has no content attribute', () => {
    const e = entry();
    const html = '<meta http-equiv=content-security-policy>';
    expect(applyGrant(html, e, spec())).toBe(html);
    expect(e.warnings).toEqual(['chat: CSP meta has no content attribute — the widget POST may be blocked']);
  });

  it('seeds an appended directive with defaults, and can refuse to append', () => {
    const e = entry();
    const out = applyGrant(PAGE("default-src 'none';"), e, spec({
      directive: 'frame-src',
      note: 'live embeds',
      defaults: ["'self'", 'data:'],
    }));
    expect(readCsp(out)?.value).toBe("default-src 'none'; frame-src 'self' data:;");
    expect(e.csp).toBe("frame-src 'self' (live embeds)");

    const refused = entry();
    const page = PAGE(CAPTURED);
    expect(applyGrant(page, refused, spec({ directive: 'worker-src', append: false }))).toBe(page);
    expect(refused.csp).toBeUndefined();
  });

  it('grants the directive in place when it is already present', () => {
    const e = entry();
    const out = applyGrant(PAGE(CAPTURED), e, spec({ directive: 'frame-src', sources: ['https://fast.wistia.net'], note: 'live embeds' }));
    expect(readCsp(out)?.value).toBe(CAPTURED.replace("frame-src 'self' data:;", "frame-src 'self' data: https://fast.wistia.net;"));
    expect(e.csp).toBe("frame-src https://fast.wistia.net (live embeds)");
  });
});

describe('the three grants together', () => {
  it('turns the captured policy into the served one, byte for byte', () => {
    // What the build does to every page that carries both a chat launcher and
    // a body above the inline threshold.
    let value = CAPTURED;
    value = grantSources(value, 'connect-src', ["'self'"]).value; // the chat mount
    value = grantSources(value, 'style-src', ["'self'"], { append: false }).value; // the dedupe pass
    value = grantSources(value, 'script-src', ["'self'"], { append: false }).value; // the dedupe pass
    expect(value).toBe(SERVED);
  });

  it('grants frame-src hosts only where the pass used them', () => {
    let value = CAPTURED;
    value = grantSources(value, 'connect-src', ["'self'"]).value;
    value = grantSources(value, 'style-src', ["'self'"], { append: false }).value;
    value = grantSources(value, 'script-src', ["'self'"], { append: false }).value;
    const withHost = grantSources(value, 'frame-src', ['https://fast.wistia.net']).value;
    expect(withHost).toBe(SERVED.replace("frame-src 'self' data:;", "frame-src 'self' data: https://fast.wistia.net;"));
    // and a page with no live frame keeps the captured frame-src
    expect(value).toBe(SERVED);
  });
});
