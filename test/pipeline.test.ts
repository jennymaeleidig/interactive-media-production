// Pipeline tests at the pre-agreed seam (spec, Testing Decisions #2 module):
// the build pipeline as a pure transformation — capture run in, served tree +
// mutation log out, with the strip audit as an invariant.
// Fixtures: test/fixtures/capture-run/ — a miniature SingleFile capture run
// mirroring the real corpus (unquoted attrs, Qualified machinery, OneTrust
// stack, truncated tail).
import { describe, it, expect, beforeAll } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, type LogEntry } from '../pipeline/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/capture-run');
const OUT = path.join(HERE, '.tmp/pipeline/served');
// the runtimes the injection passes inline — read here so tests can bound the
// growth they cause and assert their verbatim presence
const RUNTIME = readFileSync(path.join(HERE, '../pipeline/story-hook.js'), 'utf8');
const MOTION_CSS = readFileSync(path.join(HERE, '../pipeline/motion.css'), 'utf8');
const MOTION_RUNTIME = readFileSync(path.join(HERE, '../pipeline/motion-runtime.js'), 'utf8');
const INTERACTIONS_CSS = readFileSync(path.join(HERE, '../pipeline/interactions.css'), 'utf8');
const INTERACTIONS_RUNTIME = readFileSync(path.join(HERE, '../pipeline/interactions-runtime.js'), 'utf8');
const CHAT_CSS = readFileSync(path.join(HERE, '../pipeline/chat-widget.css'), 'utf8');
const CHAT_RUNTIME = readFileSync(path.join(HERE, '../pipeline/chat-widget.js'), 'utf8');
const NAV_CSS = readFileSync(path.join(HERE, '../pipeline/nav.css'), 'utf8');
const NAV_RUNTIME = readFileSync(path.join(HERE, '../pipeline/nav-runtime.js'), 'utf8');
const SCROLL_CSS = readFileSync(path.join(HERE, '../pipeline/scroll.css'), 'utf8');
const SCROLL_RUNTIME = readFileSync(path.join(HERE, '../pipeline/scroll-runtime.js'), 'utf8');
const INJECTED_BYTES = RUNTIME.length + MOTION_CSS.length + MOTION_RUNTIME.length + INTERACTIONS_CSS.length + INTERACTIONS_RUNTIME.length + NAV_CSS.length + NAV_RUNTIME.length + CHAT_CSS.length + CHAT_RUNTIME.length + SCROLL_CSS.length + SCROLL_RUNTIME.length;

// Pass 14 (ADR 0003) moves every body over KEEP_INLINE_BYTES into
// `/assets/<sha>.css|.js` and leaves a marked stand-in where the body stood —
// served bytes no longer carry the runtime bodies — so the "injected verbatim"
// assertions read the file the stand-in points at. Verbatim then means exactly
// that: the file's bytes are the bytes the pass injected.

/** The marked elements for one pass, in document order (`link` → `style`). */
function markedTags(html: string, marker: string): { kind: 'style' | 'script'; tag: string }[] {
  return [...html.matchAll(/<(link|script|style)\b[^>]*>/g)]
    .map((m) => ({ kind: (m[1] === 'link' ? 'style' : m[1]) as 'style' | 'script', tag: m[0] }))
    .filter((t) => t.tag.includes(`data-flock-parody="${marker}"`));
}

/** The `/assets/<sha>.css|.js` name a stand-in points at, or null when inline. */
function standInName(tag: string): string | null {
  return /\/assets\/([a-f0-9]{16}\.(?:css|js))/.exec(tag)?.[1] ?? null;
}

/**
 * The bytes one injected body ends up as, however the page carries them: the
 * file pass 14 wrote, or the element's own text when it stayed inline (a body
 * under the threshold, or a page whose CSP had no directive to grant).
 */
async function injectedBody(html: string, marker: string, kind: 'style' | 'script'): Promise<string> {
  const standIn = markedTags(html, marker).find((t) => t.kind === kind);
  if (standIn === undefined) throw new Error(`no ${kind} element tagged ${marker}`);
  const name = standInName(standIn.tag);
  if (name !== null) return readFile(path.join(OUT, 'assets', name), 'utf8');
  const start = html.indexOf(standIn.tag) + standIn.tag.length;
  const close = kind === 'style' ? '</style>' : '</script>';
  return html.slice(start, html.indexOf(close, start));
}

let result: { log: LogEntry[] };

beforeAll(async () => {
  await rm(path.join(HERE, '.tmp/pipeline'), { recursive: true, force: true });
  result = await runPipeline({
    runDir: FIXTURES,
    pages: ['/', '/products/gun-detection', '/book-a-demo', '/thank-you', '/gsx', '/chilipiper-2', '/var-ref', '/account', '/missing'],
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

  it('leaves non-target content untouched: JSON-LD, captured from-states, text mentions (data URIs are extracted, ADR 0002)', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    // 2 captured ld+json data blocks + the six injected runtimes (motion, interactions, nav, chat, story-hook, scroll)
    expect((html.match(/<script\b/gi) ?? []).length).toBe(8);
    expect(html).toContain('<script type=application/ld+json>{"@context":"https://schema.org","@type":"Organization"}</script>');
    // the fixture's inlined asset is externalized to a content-addressed file
    // holding the same bytes — the strip leaves it, the asset pass moves it
    const assetRef = /src="\/assets\/([a-f0-9]{16})\.png"/.exec(html);
    expect(assetRef).not.toBeNull();
    expect(await readFile(path.join(OUT, 'assets', `${assetRef?.[1]}.png`))).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(html).not.toContain('src="data:image');
    // a .word div outside a split container is not an animation word — left as captured
    expect(html).toContain('<div class=word style="color:rgb(142,168,184);opacity:0.45">Safety</div>');
    expect(html).toContain('We are flocksafety.com, in text.');
    expect(html).toContain('Flock Safety | Safer Together');
  });

  it('replaces Qualified header-var references with their 0px fallback, and never mistakes the English word "qualified" for residue', async () => {
    // corpus find (ticket 07): 4 pages carry the Vocal Video popover's
    // `top: calc(0px + var(--qualified-offer-header-inline-style-offset,
    // var(--qualified-offer-header-height,0px)))` on a real element; the
    // assignment strip left the nested reference behind, so the audit went red
    const html = await readFile(path.join(OUT, 'var-ref.html'), 'utf8');
    expect(html).not.toContain('qualified-offer');
    expect(html).toContain('top:calc(0px + 0px)');
    // the English word in page copy is content, not machinery — it survives
    expect(html).toContain('A qualified electrician should install this device.');
    const entry = result.log.find((e) => e.page === '/var-ref');
    if (!entry || entry.error) throw new Error('unreachable: fixture var-ref must log cleanly');
    expect(entry.stripped!['qualified header-height var references']).toBe(2); // outer + inner var()
    expect(entry.audit!.qualified).toBe(0);
  });

  it('strips the account Sign In chrome and unwraps inline account copy links without mocking anything', async () => {
    const html = await readFile(path.join(OUT, 'account.html'), 'utf8');
    // chrome anchors (header button + footer link) are removed wholesale
    expect(html).not.toContain('users.flocksafety.com');
    expect(html).not.toContain('>Sign In<');
    // ...but their neighbours survive
    expect(html).toContain('Get a Demo');
    // the inline copy link loses the link and keeps the words
    expect(html).not.toContain('login.flocksafety.com');
    expect(html).toContain('First, visit our Help Center to troubleshoot.');
    // the ordinary word "Account" in copy is content, not an affordance
    expect(html).toContain('Book a meeting with your Flock Account Executive.');
    const entry = result.log.find((e) => e.page === '/account');
    if (!entry || entry.error) throw new Error('unreachable: fixture account must log cleanly');
    expect(entry.stripped!['account sign-in link']).toBeGreaterThan(0); // header button + footer link, removed in bytes
    expect(entry.stripped!['account link unwrapped (copy kept)']).toBe(1);
    expect(entry.audit!.account).toBe(0);
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
  it('writes the runtime verbatim into a marked body file on every served page', async () => {
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      const [standIn, ...rest] = markedTags(html, 'story-hook');
      expect(rest, page).toEqual([]);
      expect(standIn.tag, page).toMatch(/^<script data-flock-parody="story-hook"( src=\/assets\/[a-f0-9]{16}\.js)?>$/);
      expect(await injectedBody(html, 'story-hook', 'script'), page).toBe(`\n${RUNTIME}\n`);
    }
  });

  it('places the runtime inside <body>, before the closing tags the write pass restores', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const tag = html.indexOf('<script data-flock-parody="story-hook"');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('logs the injection per page (motion, interactions, chat on launcher pages, then the story-hook seam)', () => {
    for (const entry of result.log.filter((e) => !e.error)) {
      const expected = [
        'motion layer (style+script, inline)',
        'interactions layer (style+script, inline)',
        'nav layer (style+script, inline)',
      ];
      if (entry.chatLauncher) expected.push('chat widget (style+script, inline)');
      expected.push('story-hook seam (inline, dormant)');
      expected.push('scroll layer (style+script, inline)');
      expect(entry.injected, entry.page).toEqual(expected);
    }
  });

  it('keeps the zero-outbound invariants with the runtimes aboard — audit clean, no capture-derived executable', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const census = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(census.filter((t) => /data-flock-parody=/i.test(t))).toHaveLength(6); // motion + interactions + nav + chat + story-hook + scroll
    for (const tag of census) {
      if (/data-flock-parody=/i.test(tag)) continue;
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
  });
});

describe('legibility pass (ticket 12)', () => {
  const LEG_OUT = path.join(HERE, '.tmp/pipeline/legibility');
  let legRun: { log: LogEntry[] };

  beforeAll(async () => {
    legRun = await runPipeline({
      runDir: FIXTURES,
      pages: ['/', '/products/gun-detection'],
      outDir: LEG_OUT,
      legibilityPatches: { '/products/gun-detection': '.l-section--full.bg-screen.scroller .t-subhead-1 { color: #fff; }' },
    });
  });

  it('injects the page CSS inline as one marked, inert style tag', async () => {
    const html = await readFile(path.join(LEG_OUT, 'products/gun-detection.html'), 'utf8');
    expect(html).toContain('<style data-flock-parody="legibility">');
    expect(html).toContain('.l-section--full.bg-screen.scroller .t-subhead-1 { color: #fff; }');
    expect(legRun.log.find((e) => e.page === '/products/gun-detection')?.injected).toContain('legibility CSS (inline)');
  });

  it('leaves an unpatched page without the style', async () => {
    const html = await readFile(path.join(LEG_OUT, 'index.html'), 'utf8');
    expect(html).not.toContain('data-flock-parody="legibility"');
  });
});

describe('motion pass (ticket 04)', () => {
  it('normalizes captured split-word from-states to the static end-state and annotates per-word stagger indices', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    // the captured from-props (slate color, blur 15px/20px, rise, 0.45 opacity)
    // are gone; layout props survive; --fpm-i counts words within the heading
    expect(html).toContain(
      '<div class=word aria-hidden=true style=--fpm-i:0;position:relative;display:inline-block;translate:none;rotate:none;scale:none;will-change:transform,filter,color,opacity>Public</div>'
    );
    expect(html).toContain(
      'style=--fpm-i:1;position:relative;display:inline-block;translate:none;rotate:none;scale:none;will-change:transform,filter,color,opacity>safety</div>'
    );
    expect(html).toContain(
      'style=--fpm-i:2;position:relative;display:inline-block;translate:none;rotate:none;scale:none;will-change:transform,filter,color,opacity;--fpm-blur:20px>works</div>'
    );
    // the captured blur radius rides along per element; 15px stays the CSS default
    expect(html).not.toContain('filter:blur(15px);transform:translate(0px,0.42em)');
    expect(html).not.toContain('filter:blur(20px);transform:translate(0px,0.42em)');
    // the heading's captured end-state (opacity:1) stays
    expect(html).toContain('aria-label="Public safety works better together" style=opacity:1>');
  });

  it('covers the masked split variant (split-word inside split-line-mask) with the same recipe', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    expect(html).toContain(
      '<div class=split-word aria-hidden=true style=--fpm-i:0;position:relative;display:inline-block;translate:none;rotate:none;scale:none;will-change:transform,filter,color,opacity;--fpm-blur:20px>How</div>'
    );
    // the mask wrapper itself is untouched — its overflow:clip IS the masked look
    expect(html).toContain(
      '<div class=split-line-mask aria-hidden=true style=position:relative;display:block;text-align:start;overflow:clip>'
    );
  });

  it('leaves the hero split at its captured end-state — the runtime re-fires is-visible', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).toContain(
      '<h1 data-split-onload data-split-title class="heading-4xl is-split is-visible" style=--split-final-color:rgb(254,253,251)>'
    );
    expect(html).toContain('<span class=title-word style=--word-index:0>Safer</span>');
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    expect(home.motion).toMatchObject({ 'hero split-title re-fire targets': 1, 'split words normalized+annotated': 3 });
  });

  it('normalizes fade-in-2 from-states and leaves captured end-states byte-identical', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).toContain(
      '<a data-animation-gsap=fade-in-2 href=/blog/customers-own-and-control-their-flock-data class="spotlight-card w-inline-block">Own your data</a>'
    );
    expect(html).toContain(
      '<div data-animation-gsap=fade-in-2 class=hero-cards-container style=opacity:1;translate:none;rotate:none;scale:none;transform:translate3d(0px,0px,0px)></div>'
    );
  });

  it('normalizes fade-in rise-24 from-states and the bare opacity variant', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    // rise-24 stripped; GSAP's identity-axis markers stay (captured end-state shape)
    expect(html).toContain(
      '<h2 data-animation-gsap=fade-in class=lpr1_heading style=translate:none;rotate:none;scale:none;>Detection that scales</h2>'
    );
    // the bare variant (captured from-state had no transform) is annotated so
    // motion.css replays it as a pure fade — no phantom rise
    expect(html).toContain('<h2 data-animation-gsap=fade-in class=sec-head data-fpm-fade>Bare fade</h2>');
  });

  it('normalizes image-clip from-clip to the captured end-clip inside the quoted style', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(html).toContain('style="clip-path:inset(0% 0% 0% 0%round var(--clip-r))"');
    // no captured from-clip remains in any inline style (the injected CSS
    // legitimately quotes the from-value inside its gated :not(.fpm-in) rule)
    expect(html).not.toContain('style="clip-path:inset(6%');
  });

  it('normalizes clip-in by dropping the captured opacity-0 from-class', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    // quoting is preserved — the build never re-serializes more than it mutates
    expect(html).toContain('<div data-animation-gsap=clip-in class="sec-wrap">wrap</div>');
  });

  it('the generic sweep normalizes inline zero-opacity from-states on elements no explicit rule names, tagging them for the observer', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    // IX2 reveal from-state (data-w-id, opacity:0;display:block): normalized + tagged
    expect(html).toContain(
      '<div data-w-id=0b2f0dee-4650-673b-b54a-913b956d66bb style=display:block class="filters-container w-form" data-fpm-reveal>filter</div>'
    );
    const gun = result.log.find((e) => e.page === '/products/gun-detection');
    if (!gun || gun.error) throw new Error('unreachable: fixture gun-detection must log cleanly');
    expect(gun.motion).toMatchObject({
      'generic zero-opacity normalized+tagged': 1,
      'fade-in rise-24 from-states': 1,
      'fade-in bare opacity': 1,
      'split words normalized+annotated': 1,
      'clip-in from-class': 1,
    });
  });

  it('the generic sweep leaves persistent-hidden states frozen — video chrome, hover CTAs, hidden panes, display:none', async () => {
    const html = await readFile(path.join(OUT, 'products/gun-detection.html'), 'utf8');
    // hover tween from-state (non-identity transform) — Tier 1 hover territory, not a reveal
    expect(html).toContain(
      'style="transform:translate3d(0px,-100%,0px) scale3d(1,1,1) rotateX(0deg) rotateY(0deg) rotateZ(0deg) skew(0deg,0deg);transform-style:preserve-3d;opacity:0"'
    );
    // positioned chrome (Wistia-style dot)
    expect(html).toContain('style=position:absolute;top:14.4668px;left:51.8407px;width:14.0664px;height:14.0664px;border-radius:50%;opacity:0');
    // self-animated chrome (inline transition) and doubly-hidden chrome (display:none)
    expect(html).toContain('style=background:rgb(31,58,47);display:none;opacity:0;transition:opacity 0.2s');
    // hidden tab pane (pointer-events:none) — interaction state, not a reveal
    expect(html).toContain('style=opacity:0;pointer-events:none;position:absolute;inset:0px');
    // exactly one tagged element (the `>` keeps the injected CSS/JS selector text out of the count)
    expect(html.match(/data-fpm-reveal>/g) ?? []).toHaveLength(1);
  });

  it('the generic sweep never reads CSS text or embedded documents — style blocks and srcdoc stay byte-identical', async () => {
    const home = await readFile(path.join(OUT, 'index.html'), 'utf8');
    expect(home).toContain('<style>.motion-css-fake{opacity:0}</style>');
    const sched = await readFile(path.join(OUT, 'chilipiper-2.html'), 'utf8');
    // the frozen scheduler iframe's srcdoc content is not page DOM
    expect(sched).toContain('<div style=opacity:0>hidden</div>');
    expect(sched).not.toContain('data-fpm-reveal>'); // no tagged element anywhere on the page
    expect(result.log.find((e) => e.page === '/chilipiper-2')?.motion).toEqual({});
  });

  it('writes the motion layer verbatim into marked body files on every served page — style before script, both before </body>', async () => {
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      expect(markedTags(html, 'motion').map((t) => t.kind), page).toEqual(['style', 'script']);
      expect(await injectedBody(html, 'motion', 'style'), page).toBe(`\n${MOTION_CSS}\n`);
      expect(await injectedBody(html, 'motion', 'script'), page).toBe(`\n${MOTION_RUNTIME}\n`);
      const [style, script] = markedTags(html, 'motion');
      expect(html.indexOf(style.tag), page).toBeLessThan(html.indexOf(script.tag));
      expect(html.indexOf(script.tag), page).toBeLessThan(html.indexOf(markedTags(html, 'story-hook')[0].tag));
      expect(html.indexOf(script.tag), page).toBeLessThan(html.lastIndexOf('</body>'));
    }
  });

  it('logs motion normalizations per page; pages without animation shapes log an empty motion record', () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    expect(home.motion).toMatchObject({
      'fade-in-2 from-states': 1,
      'image-clip from→end': 1,
      'fade-in rise-24 from-states': 1,
    });
    expect(result.log.find((e) => e.page === '/thank-you')?.motion).toEqual({});
    for (const entry of result.log.filter((e) => !e.error)) expect(entry.motion).toBeDefined();
  });

  it('ships the static contract by construction — every injected from-state rule is gated on the JS-added html class', async () => {
    // no-JS / reduced-motion pages never carry html.fpm-motion (the runtime is
    // what adds it), so any rule NOT gated under it would break the static end-state.
    // Asserted on the SERVED bytes: the stylesheet the page actually carries.
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const block = await injectedBody(html, 'motion', 'style');
    expect(block).toBeDefined();
    const body = block!
      .replace(/\/\*[\s\S]*?\*\//g, '') // comments
      .replace(/@media[^{]+{[\s\S]*?}\s*}\s*/g, ''); // the media-gated smooth-scroll block
    const rules = body.match(/[^{}]+\{[^{}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.trim().split('{')[0].trim()).toMatch(/^html\.fpm-motion\b/);
  });
});

describe('interactions pass (ticket 05)', () => {
  it('writes the layer verbatim into marked body files on every served page — after motion, before the story-hook seam', async () => {
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      expect(markedTags(html, 'interactions').map((t) => t.kind), page).toEqual(['style', 'script']);
      expect(await injectedBody(html, 'interactions', 'style'), page).toBe(`\n${INTERACTIONS_CSS}\n`);
      expect(await injectedBody(html, 'interactions', 'script'), page).toBe(`\n${INTERACTIONS_RUNTIME}\n`);
      const motion = html.indexOf(markedTags(html, 'motion')[1].tag);
      const interactions = html.indexOf(markedTags(html, 'interactions')[1].tag);
      const storyHook = html.indexOf(markedTags(html, 'story-hook')[0].tag);
      expect(motion, page).toBeGreaterThan(-1);
      expect(interactions, page).toBeGreaterThan(motion);
      expect(storyHook, page).toBeGreaterThan(interactions);
    }
  });

  it('makes no per-page mutations of its own — pure injection, no motion-style count record', () => {
    // the layer reads whatever interaction furniture the capture carries;
    // unlike the motion pass there is nothing to normalize, so nothing to log
    // beyond the injected marker
    for (const entry of result.log.filter((e) => !e.error)) {
      expect(entry.injected).toContain('interactions layer (style+script, inline)');
    }
  });

  it('ships the suppress-only CSS contract: the layer may silence the captured accordion tween, never add animation', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const block = await injectedBody(html, 'interactions', 'style');
    const body = block.replace(/\/\*[\s\S]*?\*\//g, ''); // comments
    // the ticket's fidelity ruling, byte-present: the license-plate-reader
    // accordion is function-only — the captured grid-rows tween is suppressed
    expect(body).toContain('.accordion-css__item-bottom { transition: none !important; }');
    // suppress-only: no rule may introduce a transition or animation of its own
    const transitions = body.match(/transition\s*:[^;}]*/g) ?? [];
    for (const t of transitions) expect(t.replace(/\s+/g, '')).toBe('transition:none!important');
    expect(body).not.toMatch(/\banimation\s*(?:-name)?\s*:/);
  });
});

describe('chat mount (ticket 10)', () => {
  // pass 14 replaces both bodies with marked stand-ins (ADR 0003)
  const CHAT_STAND_IN = (html: string) => markedTags(html, 'chat');
  // the fixture captures that mounted <q-root>, and those that did not
  const MOUNTED = ['/', '/products/gun-detection', '/book-a-demo', '/thank-you'];
  const ABSENT = ['/gsx', '/chilipiper-2', '/var-ref', '/account'];
  const fileFor = (page: string) => (page === '/' ? 'index' : page.replace(/^\//, ''));

  it('records the launcher census per page, taken from the same marker the strip removes', () => {
    for (const entry of result.log.filter((e) => !e.error)) {
      expect(entry.chatLauncher, entry.page).toBe(MOUNTED.includes(entry.page));
    }
    // a failed page logs only its error — no census to misread
    expect(result.log.find((e) => e.page === '/missing')?.chatLauncher).toBeUndefined();
  });

  it('mounts the mimic on every page the original had it, and nowhere else', async () => {
    for (const page of MOUNTED) {
      const html = await readFile(path.join(OUT, `${fileFor(page)}.html`), 'utf8');
      expect(CHAT_STAND_IN(html).map((t) => t.kind), page).toEqual(['style', 'script']);
    }
    for (const page of ABSENT) {
      const html = await readFile(path.join(OUT, `${fileFor(page)}.html`), 'utf8');
      expect(html, page).not.toContain('data-flock-parody="chat"');
    }
  });

  it('mounts the same runtime bytes on every mounted page — one behavior site-wide', async () => {
    const names = new Set<string>();
    for (const page of MOUNTED) {
      const html = await readFile(path.join(OUT, `${fileFor(page)}.html`), 'utf8');
      expect(await injectedBody(html, 'chat', 'style'), page).toBe(`\n${CHAT_CSS}\n`);
      expect(await injectedBody(html, 'chat', 'script'), page).toBe(`\n${CHAT_RUNTIME}\n`);
      const name = standInName(CHAT_STAND_IN(html)[1].tag);
      expect(name, page).not.toBeNull();
      names.add(name!);
    }
    // identical bodies hash identically, so the four pages share one file
    expect(names.size).toBe(1);
  });

  it('injects chat before the story-hook seam, so the seam stays the final runtime', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const at = (marker: string) => html.indexOf(markedTags(html, marker)[1].tag);
    expect(at('chat')).toBeGreaterThan(at('interactions'));
    expect(at('chat')).toBeLessThan(html.indexOf(markedTags(html, 'story-hook')[0].tag));
  });

  it('keeps the zero-outbound invariants: chat is a marked injected runtime, and reintroduces no machinery marker', async () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, account: 0, 'known trackers': 0, externalFormActions: 0, 'off-allowlist frames': 0, 'srcdoc scripts': 0, 'unclassified remote refs': 0 });
    expect(home.scripts).toEqual({ total: 8, executable: 0, ldJson: 2, injected: 6, srcdocAllowScripts: 0 });
    // the widget CSS/runtime must not reintroduce the markers the strip audit keys on
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    for (const marker of ['qualified-offer-', 'qualified.com', '_qualified-', 'q-root', 'q-focus-sentinel', 'q-launcher', 'q-messenger-frame']) {
      expect(html.includes(marker), marker).toBe(false);
    }
  });

  it('counts the census into the build summary', async () => {
    const summary = JSON.parse(await readFile(path.join(OUT, 'build-summary.json'), 'utf8'));
    expect(summary.chat).toEqual({ mounted: MOUNTED.length, absent: ABSENT.length });
  });

  it("grants the chat runtime exactly `connect-src 'self'` in the captured CSP — and only on mounted pages", async () => {
    // the captured CSP is `default-src 'none'` with no connect-src: on a real
    // browser it refuses the widget's /api/chat POST. The mount appends the
    // single source the mimic needs and leaves the rest of the policy alone
    // (jsdom does not enforce CSP, so this is the pipeline's own guard).
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const meta = /<meta\b[^>]*http-equiv=\s*content-security-policy[^>]*>/i.exec(html)?.[0];
    expect(meta).toBeDefined();
    expect(meta).toContain("connect-src 'self';");
    expect(meta).toContain("default-src 'none';");
    expect(meta).not.toMatch(/connect-src\s+https?:/);
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    // pass 14 grants `'self'` for the bodies it moved, on top of the chat grant
    expect(home.csp?.split('; ')[0]).toBe("connect-src 'self' (chat mount)");
    for (const page of ABSENT) {
      expect(result.log.find((e) => e.page === page)?.csp ?? '', page).not.toContain('connect-src');
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
    // growth invariant, measured where it is true: every pass before 14 adds at
    // most the injected runtimes — stripping never adds bytes, normalization
    // removes them, annotations add a bounded per-element few bytes. (On the
    // real corpus pages still shrink: strip removes ~MB.)
    const growth = home.deduped!.bytesIn! - home.bytesIn!;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(INJECTED_BYTES + 300);
    // …and pass 14 then takes the bodies back out of the page (ADR 0003)
    expect(home.bytesOut).toBe(home.deduped!.bytesOut);
    expect(home.bytesOut!).toBeLessThan(home.deduped!.bytesIn!);
    // strip mutations: per-target removed-byte counts
    expect(stripped['qualified-offer-host']).toBeGreaterThan(0);
    expect(stripped['q-root (chat launcher)']).toBeGreaterThan(0);
    expect(stripped['onetrust-banner-sdk']).toBeGreaterThan(0);
    expect(stripped['qualified header-height var']).toBe(1);
    expect(stripped['qualified header-shift attrs']).toBe(1);
    expect(home.linksRewritten).toBe(5); // 4 nav links + the spotlight-card (the offer-host link was stripped with its subtree)
    expect(home.restored).toEqual(['</body></html> (capture was truncated)']);
    // invariants on the served bytes
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, account: 0, 'known trackers': 0, externalFormActions: 0, 'off-allowlist frames': 0, 'srcdoc scripts': 0, 'unclassified remote refs': 0 });
    expect(home.scripts).toEqual({ total: 8, executable: 0, ldJson: 2, injected: 6, srcdocAllowScripts: 0 });
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
    expect(result.log.filter((e) => !e.error)).toHaveLength(8);
  });
});

describe('pass 14: bodies ship as files (ADR 0003)', () => {
  const assetsIndex = () => JSON.parse(readFileSync(path.join(OUT, 'assets.json'), 'utf8')) as string[];

  it('names every body file after its own bytes, and writes them where the assets live', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const standIns = markedTags(html, 'motion').concat(markedTags(html, 'chat'));
    expect(standIns.length).toBeGreaterThan(0);
    for (const { tag } of standIns) {
      const name = standInName(tag);
      if (name === null) continue;
      const bytes = readFileSync(path.join(OUT, 'assets', name));
      // <sha256[:16]> of the body, so the name is the content
      const { createHash } = await import('node:crypto');
      expect(createHash('sha256').update(bytes).digest('hex').slice(0, 16)).toBe(name.replace(/\.\w+$/, ''));
    }
  });

  it('lists the body files in assets.json, so the serving check walks and types them', () => {
    // every stand-in the served tree carries points at a name the manifest lists
    const listed = new Set(assetsIndex());
    const referenced = new Set<string>();
    for (const file of readdirSync(OUT, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.html')) continue;
      const html = readFileSync(path.join(OUT, file), 'utf8');
      for (const m of html.matchAll(/<link rel=stylesheet href=\/assets\/([a-f0-9]{16}\.css)|<script[^>]*src=\/assets\/([a-f0-9]{16}\.js)/g)) {
        const name = (m[1] ?? m[2])!;
        expect(listed.has(name), `${file} → ${name}`).toBe(true);
        referenced.add(name);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    // and the summary counts the same files (extra .css/.js names in the
    // manifest are data: URIs the asset pass extracted, which is its business)
    const summary = JSON.parse(readFileSync(path.join(OUT, 'build-summary.json'), 'utf8'));
    expect(summary.bodies.files).toBe(referenced.size);
    expect(summary.assets.distinct).toBe(listed.size);
    expect(summary.bodies.styles).toBeGreaterThan(0);
    // six injected runtimes per page, on the pages whose captured CSP allows a grant
    expect(summary.bodies.scripts % 6, `${summary.bodies.scripts} scripts`).toBe(0);
    expect(summary.bodies.scripts).toBeGreaterThan(0);
    expect(summary.bodies.kept).toBeGreaterThan(0);
  });

  it('keeps a body inline on a page whose captured CSP has no directive to grant', async () => {
    // the fixture's /gsx capture carries no CSP meta, and a body left inline is
    // the only safe answer: a file the page cannot load would drop the runtime
    const html = await readFile(path.join(OUT, 'gsx.html'), 'utf8');
    expect(html).not.toContain('content-security-policy');
    const storyHook = markedTags(html, 'story-hook')[0];
    expect(storyHook.tag).toBe('<script data-flock-parody="story-hook">');
    expect(await injectedBody(html, 'story-hook', 'script')).toBe(`\n${RUNTIME}\n`);
    const entry = result.log.find((e) => e.page === '/gsx');
    if (!entry || entry.error) throw new Error('unreachable: fixture gsx must log cleanly');
    expect(entry.deduped!.script).toBe(0);
    expect(entry.deduped!.style).toBe(0);
    expect(entry.warnings).toContain('dedupe: no CSP meta — bodies left inline');
    expect(entry.csp).toBeUndefined();
  });

  it('grants `self` for the kinds it moved, replacing each directive once', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const meta = /<meta\b[^>]*http-equiv=\s*content-security-policy[^>]*>/i.exec(html)?.[0];
    expect(meta).toContain("style-src 'unsafe-inline' 'self';");
    expect(meta).toContain("script-src 'unsafe-inline' data: 'self';");
    // a second directive would intersect with the captured one and keep the
    // files blocked, so neither may appear twice
    expect(meta!.match(/style-src/g)).toHaveLength(1);
    expect(meta!.match(/script-src/g)).toHaveLength(1);
  });

  it('shrinks the page and logs the pass per page', async () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    expect(home.deduped).toMatchObject({ style: 4, script: 6 });
    expect(home.deduped!.bytesOut).toBeLessThan(home.deduped!.bytesIn);
    expect(home.warnings).toEqual([]);
    expect(home.injected).toContain('scroll layer (style+script, inline)'); // 671 bytes: under the threshold, stays put
  });
});

describe('build-level routing & scaffolding (ticket 07)', () => {
  const DROP_OUT = path.join(HERE, '.tmp/pipeline/drop');
  let dropRun: { log: LogEntry[]; summary: { requested: number; served: number; dropped: string[]; errors: string[] } };

  beforeAll(async () => {
    // seed a stale served file for the dropped page (an earlier build wrote it)
    mkdirSync(DROP_OUT, { recursive: true });
    writeFileSync(path.join(DROP_OUT, 'form-test.html'), '<html>stale</html>');
    dropRun = await runPipeline({
      runDir: FIXTURES,
      pages: ['/', '/thank-you', '/form-test'],
      dropPages: ['/form-test'],
      outDir: DROP_OUT,
    });
  });

  it('drops scaffold/test pages from serving entirely — never built, stale file removed', () => {
    expect(dropRun.log.map((e) => e.page)).not.toContain('/form-test');
    expect(existsSync(path.join(DROP_OUT, 'form-test.html'))).toBe(false);
  });

  it('accounts for every requested page in the summary', () => {
    expect(dropRun.summary).toMatchObject({ requested: 3, served: 2, dropped: ['/form-test'], errors: [] });
    expect(dropRun.summary.served + dropRun.summary.dropped.length + dropRun.summary.errors.length).toBe(dropRun.summary.requested);
  });

  it('writes redirects.json from the run manifest and surfaces the route classes in the summary', async () => {
    const table = JSON.parse(await readFile(path.join(DROP_OUT, 'redirects.json'), 'utf8'));
    expect(table).toEqual({ '/legal/privacy-notice': '/thank-you' });
    const summary = JSON.parse(await readFile(path.join(DROP_OUT, 'build-summary.json'), 'utf8'));
    expect(summary.redirects).toEqual({ count: 1, invalid: [], dangling: [] });
    expect(summary.deadRoots).toEqual(['/ebooks']);
    expect(summary.authGated).toEqual(['/events/test-event']);
    expect(summary.captureRun).toBe('test/fixtures/capture-run');
  });

  it('warns about a redirect whose target is not served (a visitor would hit a 404)', async () => {
    const { summary } = await runPipeline({
      runDir: FIXTURES,
      pages: ['/'], // /thank-you deliberately not built → the stub dangles
      outDir: path.join(HERE, '.tmp/pipeline/dangling'),
    });
    expect(summary.redirects.dangling).toEqual(['/legal/privacy-notice → /thank-you']);
  });

  it('leaves the redirect table empty when the run has no uncaptured manifest', async () => {
    const NO_MANIFEST = path.join(HERE, '.tmp/pipeline/no-manifest-run');
    mkdirSync(NO_MANIFEST, { recursive: true });
    writeFileSync(path.join(NO_MANIFEST, 'index.html'), '<html><head><title>Bare</title></head><body>x</body></html>');
    const { summary } = await runPipeline({ runDir: NO_MANIFEST, pages: ['/'], outDir: path.join(HERE, '.tmp/pipeline/no-manifest') });
    expect(summary.redirects.count).toBe(0);
    expect(JSON.parse(await readFile(path.join(HERE, '.tmp/pipeline/no-manifest/redirects.json'), 'utf8'))).toEqual({});
  });
});

describe('scroll pass (ticket 21)', () => {
  const RUN = path.join(HERE, '.tmp/pipeline/scroll-run');
  const SCROLL_OUT = path.join(HERE, '.tmp/pipeline/scroll');
  let run: { log: LogEntry[] };

  const CAPTURE = `<!DOCTYPE html><html><head></head><body>
<h2 animate=scrub-word><span class="gsap_split_word gsap_split_word1" style="position:relative;display:inline-block;color:rgb(34,40,31)">Detect</span></h2>
<div class=line-label style="translate:none;rotate:none;scale:none;transform:translate3d(0px,0px,0px) scale(0,0)"><img class=line-label--marker style="translate:none;rotate:none;scale:none;transform:translate(0px,170%)"></div>
<section data-route-anim scroller class="l-section--full bg-screen scroller" style=translate:none;rotate:none;scale:none;transform:scale(0.9,0.9)>
<div id=stickme-parent class="l-layout_z p-rel edge cc-pd"><div id=stickme class=btn-sticky--wrap></div></div>
<svg viewBox="0 0 10 10"><path id=main-progress d="M0 0L0 10" style="stroke-dashoffset:10px;stroke-dasharray:10"></path></svg>
</section>
<div class="l-stack c-modal__panel" style="translate:none;rotate:none;scale:none;transform:translate(0px,6rem)"></div>
</body></html>`;

  beforeAll(async () => {
    await rm(RUN, { recursive: true, force: true });
    mkdirSync(RUN, { recursive: true });
    writeFileSync(path.join(RUN, 'scroll-page.html'), CAPTURE);
    run = await runPipeline({ runDir: RUN, pages: ['/scroll-page'], outDir: SCROLL_OUT });
  });

  it('normalizes every captured scroll from-state to its end-state for the no-JS page', async () => {
    const html = await readFile(path.join(SCROLL_OUT, 'scroll-page.html'), 'utf8');
    expect(html).toContain('scale(1,1)');
    expect(html).toContain('translate(0px,0%)');
    expect(html).not.toContain('color:rgb(34,40,31)');
    expect(html).toContain('stroke-dashoffset:0');
    expect(html).toContain('translate(0px,0px)');
    // the frozen zoom from-state is dropped entirely — the live page settles at
    // scale 1, and a leftover transform would be a containing block for any
    // `position: fixed` element inside the section
    expect(html).toContain('class="l-section--full bg-screen scroller" style=translate:none;rotate:none;scale:none>');
    expect(html).not.toContain('scale(0.9,0.9)');
  });

  it('logs the normalizations and injects the marked scroll layer', async () => {
    const entry = run.log.find((e) => e.page === '/scroll-page');
    if (!entry || entry.error) throw new Error('unreachable: the synthetic scroll page must build');
    expect(entry.scroll).toMatchObject({
      'line-label scale (0→1)': 1,
      'line-label marker slide (170%→0)': 1,
      'scrub-word from-color': 1,
      'main-progress draw (undrawn→drawn)': 1,
      'modal panel slide': 1,
      'section zoom settle (0.9→1)': 1,
    });
    expect(entry.injected).toContain('scroll layer (style+script, inline)');
    const html = await readFile(path.join(SCROLL_OUT, 'scroll-page.html'), 'utf8');
    expect(html).toContain('<style data-flock-parody="scroll">');
    expect(html).toContain('<script data-flock-parody="scroll">');
  });
});
