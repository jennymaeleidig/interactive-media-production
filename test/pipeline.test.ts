// Pipeline tests at the pre-agreed seam (spec, Testing Decisions #2 module):
// the build pipeline as a pure transformation — capture run in, served tree +
// mutation log out, with the strip audit as an invariant.
// Fixtures: test/fixtures/capture-run/ — a miniature SingleFile capture run
// mirroring the real corpus (unquoted attrs, Qualified machinery, OneTrust
// stack, truncated tail).
import { describe, it, expect, beforeAll } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const INJECTED_BYTES = RUNTIME.length + MOTION_CSS.length + MOTION_RUNTIME.length + INTERACTIONS_CSS.length + INTERACTIONS_RUNTIME.length + NAV_CSS.length + NAV_RUNTIME.length + CHAT_CSS.length + CHAT_RUNTIME.length;

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
    // 2 captured ld+json data blocks + the five injected runtimes (motion, interactions, nav, chat, story-hook)
    expect((html.match(/<script\b/gi) ?? []).length).toBe(7);
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

  it('logs the injection per page (motion, interactions, chat on launcher pages, then the story-hook seam)', () => {
    for (const entry of result.log.filter((e) => !e.error)) {
      const expected = [
        'motion layer (style+script, inline)',
        'interactions layer (style+script, inline)',
        'nav layer (style+script, inline)',
      ];
      if (entry.chatLauncher) expected.push('chat widget (style+script, inline)');
      expected.push('story-hook seam (inline, dormant)');
      expect(entry.injected, entry.page).toEqual(expected);
    }
  });

  it('keeps the zero-outbound invariants with the runtimes aboard — audit clean, no capture-derived executable', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const census = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(census.filter((t) => /data-flock-parody=/i.test(t))).toHaveLength(5); // motion + interactions + nav + chat + story-hook
    for (const tag of census) {
      if (/data-flock-parody=/i.test(tag)) continue;
      expect(tag).toMatch(/type\s*=\s*("|')?application\/ld\+json/i);
    }
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

  it('injects the motion layer inline, verbatim and marked, on every served page — style before script, both before </body>', async () => {
    const motionTag = `<style data-flock-parody="motion">\n${MOTION_CSS}\n</style>\n<script data-flock-parody="motion">\n${MOTION_RUNTIME}\n</script>`;
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      expect(html, page).toContain(motionTag);
      expect(html.indexOf('<style data-flock-parody="motion">'), page).toBeLessThan(html.indexOf('<script data-flock-parody="story-hook">'));
      const closeBody = html.lastIndexOf('</body>');
      expect(html.lastIndexOf('</script>', closeBody), page).toBeGreaterThan(-1);
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
    // Asserted on the SERVED bytes: the style block the page actually carries.
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const block = /<style data-flock-parody="motion">\n([\s\S]*?)\n<\/style>/.exec(html)?.[1];
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
  it('injects the layer inline, verbatim and marked, on every served page — after motion, before the story-hook seam', async () => {
    const interactionsTag = `<style data-flock-parody="interactions">\n${INTERACTIONS_CSS}\n</style>\n<script data-flock-parody="interactions">\n${INTERACTIONS_RUNTIME}\n</script>`;
    for (const page of ['index', 'products/gun-detection', 'book-a-demo', 'thank-you', 'gsx', 'chilipiper-2']) {
      const html = await readFile(path.join(OUT, `${page}.html`), 'utf8');
      expect(html, page).toContain(interactionsTag);
      const motion = html.indexOf('<script data-flock-parody="motion">');
      const interactions = html.indexOf('<script data-flock-parody="interactions">');
      const storyHook = html.indexOf('<script data-flock-parody="story-hook">');
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
    const block = /<style data-flock-parody="interactions">\n([\s\S]*?)\n<\/style>/.exec(html)?.[1];
    expect(block).toBeDefined();
    const body = block!.replace(/\/\*[\s\S]*?\*\//g, ''); // comments
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
  const CHAT_TAG = `<style data-flock-parody="chat">\n${CHAT_CSS}\n</style>\n<script data-flock-parody="chat">\n${CHAT_RUNTIME}\n</script>`;
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
      expect(html, page).toContain(CHAT_TAG);
    }
    for (const page of ABSENT) {
      const html = await readFile(path.join(OUT, `${fileFor(page)}.html`), 'utf8');
      expect(html, page).not.toContain('data-flock-parody="chat"');
    }
  });

  it('mounts the same runtime bytes on every mounted page — one behavior site-wide', async () => {
    for (const page of MOUNTED) {
      const html = await readFile(path.join(OUT, `${fileFor(page)}.html`), 'utf8');
      expect(html, page).toContain(`<script data-flock-parody="chat">\n${CHAT_RUNTIME}\n</script>`);
    }
  });

  it('injects chat before the story-hook seam, so the seam stays the final runtime', async () => {
    const html = await readFile(path.join(OUT, 'index.html'), 'utf8');
    const chat = html.indexOf('<script data-flock-parody="chat">');
    expect(chat).toBeGreaterThan(html.indexOf('<script data-flock-parody="interactions">'));
    expect(chat).toBeLessThan(html.indexOf('<script data-flock-parody="story-hook">'));
  });

  it('keeps the zero-outbound invariants: chat is a marked injected runtime, and reintroduces no machinery marker', async () => {
    const home = result.log.find((e) => e.page === '/');
    if (!home || home.error) throw new Error('unreachable: fixture homepage must log cleanly');
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, account: 0, 'known trackers': 0, externalFormActions: 0, 'off-allowlist frames': 0 });
    expect(home.scripts).toEqual({ total: 7, executable: 0, ldJson: 2, injected: 5 });
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
    expect(home.csp).toBe("connect-src 'self' (chat mount)");
    for (const page of ABSENT) {
      expect(result.log.find((e) => e.page === page)?.csp, page).toBeUndefined();
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
    // growth invariant: the injected runtimes are the ONLY things that can
    // grow a page — stripping never adds bytes, normalization removes them,
    // annotations add a bounded per-element few bytes. (On the real corpus
    // pages still shrink: strip removes ~MB.)
    const growth = home.bytesOut! - home.bytesIn!;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(INJECTED_BYTES + 300);
    // strip mutations: per-target removed-byte counts
    expect(stripped['qualified-offer-host']).toBeGreaterThan(0);
    expect(stripped['q-root (chat launcher)']).toBeGreaterThan(0);
    expect(stripped['onetrust-banner-sdk']).toBeGreaterThan(0);
    expect(stripped['qualified header-height var']).toBe(1);
    expect(stripped['qualified header-shift attrs']).toBe(1);
    expect(home.linksRewritten).toBe(5); // 4 nav links + the spotlight-card (the offer-host link was stripped with its subtree)
    expect(home.restored).toEqual(['</body></html> (capture was truncated)']);
    // invariants on the served bytes
    expect(home.audit).toEqual({ qualified: 0, onetrust: 0, account: 0, 'known trackers': 0, externalFormActions: 0, 'off-allowlist frames': 0 });
    expect(home.scripts).toEqual({ total: 7, executable: 0, ldJson: 2, injected: 5 });
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
