// Ticket 04's seam: the **chrome projection** — the nav, footer and global
// chrome the copy projection is blind to — and the allow-list that absorbs
// exactly the regions our strip pass removed. The projection, the allow-list
// matchers, the masking and the run's counts are all pure functions of a page's
// HTML, so the whole of ticket 04 is pinned here: the projection's rules, the
// allow-list's provenance against `served/build-log.json`, a finding that
// survives removing an entry, and the committed tree fed in as both sides.
//
// The network edge (`regression/upstream-watch-cli.mjs`) is hand-run and
// deliberately outside the suite. The worked false positive — the live nav's
// `users.flocksafety.com` sign-in link — is registered here as the fixture the
// allow-list exists for, so no future live-versus-ours idea has to rediscover it.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWatchReport, exitCode, formatWatchReport } from '../regression/upstream-watch.mjs';
import { runWatch } from '../regression/upstream-baseline.mjs';
import { copyRuns } from '../regression/upstream-copy.mjs';
import {
  CHROME_ALLOW_LIST,
  CHROME_RUNTIME_FILL,
  chromeDigest,
  chromeFinding,
  chromeMaskedRuns,
  chromeReport,
  chromeRuns,
} from '../regression/upstream-chrome.mjs';

const SERVED_DIR = new URL('../served/', import.meta.url);

/** Every HTML file the committed tree serves, in path order. */
const servedPages = readdirSync(SERVED_DIR, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('.html'))
  .map((name) => ({ name, file: new URL(name, SERVED_DIR) }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const ORIGIN = 'https://www.flocksafety.com';
const VERIFIED = '2026-09-13';

/** One run's fetched inputs: the universe is the union of these three sources. */
function run(sitemap: string[], capture: string[], probes: Record<string, { status: number; location?: string }>, homepage: string[] = []) {
  return {
    origin: ORIGIN,
    sitemapXml: `<urlset>${sitemap.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`,
    homepageHtml: homepage.map((p) => `<a href="${p}">nav</a>`).join(''),
    captureList: capture.map((p) => `${ORIGIN}${p}`),
    probes,
  };
}

/** The steady state: two live pages we already serve, so a run is silent
 * against the frozen Capture list and against the baseline. */
const steady = () => run(['/a', '/b'], ['/a', '/b'], { '/a': { status: 200 }, '/b': { status: 200 } });

/** Two fixture pages for the tier tests: only /a's live chrome varies. */
const fixturePages = (live: string) => [
  { path: '/a', served: '<div class="nav">Old label</div>', live },
  { path: '/b', served: '<div class="nav">Same</div>', live: '<div class="nav">Same</div>' },
];

describe('chromeRuns — chrome is the text the copy projection is blind to', () => {
  it('reads a non-prose block element’s inline text, not the prose', () => {
    // The heading is prose (copy owns it); the nav label is chrome.
    const html = '<h1>Real heading</h1><div class="w-nav">Products</div><div class="button">Sign In</div>';
    expect(chromeRuns(html)).toEqual(['Products', 'Sign In']);
  });

  it('takes a block’s inline text as one run and a nested block as its own', () => {
    expect(chromeRuns('<div>Products <span>and</span> Pricing</div>')).toEqual(['Products and Pricing']);
    expect(chromeRuns('<div>Before<div>Nested</div>After</div>')).toEqual(['Before After', 'Nested']);
  });

  it('keeps inline text around a nested prose block, separated', () => {
    // Prose stays in copy, but it must not glue the chrome words around it.
    const chrome = chromeRuns('<div>Before<p>prose</p>After</div>');
    expect(chrome).toEqual(['Before After']);
  });

  it('skips generated regions the live fetch cannot carry', () => {
    const html = `
      <div>Chrome</div>
      <ul data-toc><li>Table of contents template</li></ul>
      <div data-job-name="jobs">Jobs template</div>
      <wistia-player><div>Transcript</div></wistia-player>`;
    expect(chromeRuns(html)).toEqual(['Chrome']);
  });

  it('leaves prose subtrees to the copy projection — a list item is not chrome', () => {
    // The copy projection reads this `<li>`; chrome must not read it twice.
    expect(chromeRuns('<ul><li><a href="/x"><div>License Plate Readers</div></a></li></ul>')).toEqual([]);
  });

  it('is the exact complement of the copy projection: each owns its own text', () => {
    // The spec's projection seam, both directions on one page: chrome takes the
    // nav label and not the prose; copy takes the prose and not the nav label.
    const html = '<div class="nav">Products</div><p>Real prose</p>';
    expect(chromeRuns(html)).toEqual(['Products']);
    expect(copyRuns(html)).toEqual(['Real prose']);
  });

  it('normalizes entities, whitespace and void separators like a reader sees them', () => {
    expect(chromeRuns('<div>a &amp; b</div>')).toEqual(['a & b']);
    expect(chromeRuns('<div>a&nbsp;b</div>')).toEqual(['a b']);
    expect(chromeRuns('<div>one<br>two</div>')).toEqual(['one two']);
  });

  it('is a pure function: the same HTML projects the same runs', () => {
    const html = '<div class="nav">Products</div>';
    expect(chromeRuns(html)).toEqual(chromeRuns(html));
  });
});

describe('the allow-list — the strip table’s targets, and their measurement', () => {
  /** The live markup the retired strip pass matched for each target. */
  const liveMarkup: Record<string, string> = {
    'qualified-offer-host': '<div id="_qualified-offer-host-abc" class="qualified-offer">Offer</div>',
    'q-root (chat launcher)': '<q-root class="q-root"><div>Chat</div></q-root>',
    'q-focus-sentinel': '<q-focus-sentinel></q-focus-sentinel>',
    'qualified-offer-style-element': '<style id="qualified-offer-style-1">.qualified-offer{}</style>',
    'qualified-offer CSS (bare style)': '<style>.x{color:red}/* qualified-offer- */</style>',
    'onetrust-pc-dark-filter': '<div class="onetrust-pc-dark-filter">dim</div>',
    'onetrust-consent-sdk (empty root)': '<div id="onetrust-consent-sdk"></div>',
    'onetrust-banner-sdk': '<div id="onetrust-banner-sdk">banner</div>',
    'onetrust-pc-sdk': '<div id="onetrust-pc-sdk">preferences</div>',
    'onetrust-style': '<style id="onetrust-style">#onetrust{}</style>',
    'account sign-in link': '<a href="https://users.flocksafety.com/login" class="button is-nav w-inline-block"><div>Sign In</div></a>',
  };

  it('names one entry per strip-table target, with the live markup it matches', () => {
    expect(CHROME_ALLOW_LIST).toHaveLength(11);
    expect(CHROME_ALLOW_LIST.map((e) => e.name).sort()).toEqual(Object.keys(liveMarkup).sort());
    for (const entry of CHROME_ALLOW_LIST) {
      const { hits } = chromeMaskedRuns(liveMarkup[entry.name]);
      expect(Object.keys(hits), entry.name).toEqual([entry.name]);
    }
  });

  it('does not match a real footer link that merely mentions OneTrust', () => {
    // served/ pages carry this anchor; matching it would mask real chrome.
    const privacy = '<div class="footer"><a href="https://privacyportal.onetrust.com/webform/x" class="footer-5_link">Privacy Policy</a></div>';
    expect(chromeMaskedRuns(privacy).hits).toEqual({});
    expect(chromeRuns(privacy)).toEqual(['Privacy Policy']);
  });

  it('does not match an auth-host link that is not a classed sign-in chrome link', () => {
    // The retired strip pass unwrapped these, keeping the copy; they are not a
    // strip target, so the allow-list must not mask them.
    const help = '<div class="footer"><a href="https://users.flocksafety.com/help">Help Center</a></div>';
    expect(chromeMaskedRuns(help).hits).toEqual({});
  });

  it('records the measurement behind each entry, cross-checked against the log', () => {
    const log = JSON.parse(readFileSync(new URL('../served/build-log.json', import.meta.url), 'utf8')) as Array<{
      page: string;
      stripped: Record<string, number>;
    }>;
    const homepage = log.find((row) => row.page === '/');
    expect(homepage).toBeDefined();
    for (const entry of CHROME_ALLOW_LIST) {
      const pages = log.filter((row) => entry.name in (row.stripped ?? {})).length;
      expect(entry.measured.pages, entry.name).toBe(pages);
      expect(entry.measured.bytes, entry.name).toBe(homepage?.stripped[entry.name] ?? 0);
    }
  });

  it('records the sign-in false positive with its homepage evidence', () => {
    const signin = CHROME_ALLOW_LIST.find((e) => e.name === 'account sign-in link');
    expect(signin?.measured).toEqual({ pages: 1180, bytes: 1404 });
  });
});

describe('chromeMaskedRuns / chromeFinding — the allow-list absorbs the strip', () => {
  const SERVED = '<div class="nav">Menu</div>';
  const LIVE =
    '<div class="nav">Menu<a href="https://users.flocksafety.com/login" class="button"><div>Sign In</div></a></div>';

  it('masks an allow-listed region out of the live page and counts the hit', () => {
    const { runs, hits } = chromeMaskedRuns(LIVE);
    expect(runs).toEqual(['Menu']);
    expect(hits).toEqual({ 'account sign-in link': { regions: 1, chars: 7 } });
  });

  it('absorbs the strip-pass false positive: no finding with the allow-list', () => {
    expect(chromeFinding('/x', SERVED, LIVE)).toBeNull();
  });

  it('makes the finding reappear when the entry is removed from the list', () => {
    const without = CHROME_ALLOW_LIST.filter((e) => e.name !== 'account sign-in link');
    const finding = chromeFinding('/x', SERVED, LIVE, without);
    expect(finding).toEqual({ path: '/x', hunks: [{ served: [], live: ['Sign In'] }] });
  });

  it('reports a chrome change the strip does not explain — a new nav item', () => {
    const live = '<div class="nav">Menu</div><div class="nav">Pricing</div>';
    expect(chromeFinding('/x', SERVED, live)).toEqual({
      path: '/x',
      hunks: [{ served: [], live: ['Pricing'] }],
    });
  });

  it('reports a renamed menu as a finding', () => {
    const live = '<div class="nav">Solutions</div>';
    expect(chromeFinding('/x', SERVED, live)).toEqual({
      path: '/x',
      hunks: [{ served: ['Menu'], live: ['Solutions'] }],
    });
  });
});

describe('chromeReport — one run of the chrome tier', () => {
  it('counts pages compared and differed, and totals the allow-list hits', () => {
    const withStrip = '<div class="nav">Old label<a href="https://users.flocksafety.com/login" class="button">Sign In</a></div>';
    const report = chromeReport(fixturePages(withStrip));
    expect(report.compared).toBe(2);
    expect(report.differed).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.hits).toEqual([{ name: 'account sign-in link', regions: 1, chars: 7 }]);
  });

  it('reports an unexplained change as a finding', () => {
    const report = chromeReport(fixturePages('<div class="nav">New label</div>'));
    expect(report.differed).toBe(1);
    expect(report.findings).toEqual([{ path: '/a', hunks: [{ served: ['Old label'], live: ['New label'] }] }]);
    expect(report.hits).toEqual([]);
  });
});

describe('the committed tree fed in as both sides — the steady state', () => {
  const pages = servedPages.map((page) => {
    const html = readFileSync(page.file, 'utf8');
    return { path: page.name, served: html, live: html };
  });

  it('diffs the tree against itself to nothing, with no allow-list hits', () => {
    const report = chromeReport(pages);
    expect(report.compared).toBe(servedPages.length);
    expect(report.differed).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.hits).toEqual([]);
  });

  it('projects chrome from every served page — no page is a silent blank', () => {
    for (const page of servedPages) {
      expect(chromeRuns(readFileSync(page.file, 'utf8')).length, page.name).toBeGreaterThan(0);
    }
  });
});

// Ticket 04: the chrome tier joins the run report. It is report-only in the
// sense that a soft finding never by itself moves the reference point, but the
// live chrome digest joins the baseline row (ticket 05), so a chrome difference
// is drift: it sets exit 1 and names the path and the runs in the human output.
describe('the chrome tier — run report and exit code', () => {
  it('records the chrome tier on the run report and the live chrome digest on the baseline row', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, chromePages: fixturePages('<div class="nav">New label</div>') });
    expect(result.report.chrome).toEqual({
      compared: 2,
      differed: 1,
      findings: [{ path: '/a', hunks: [{ served: ['Old label'], live: ['New label'] }] }],
      hits: [],
    });
    // Ticket 05: the live masked chrome digest joins the baseline row, so a
    // later run can see upstream's chrome move even before the per-page
    // comparison says so.
    expect(result.baseline.rows.find((r) => r.path === '/a')?.chrome).toBe(chromeDigest(['New label']));
    expect(result.baseline.rows.find((r) => r.path === '/b')?.chrome).toBe(chromeDigest(['Same']));
  });

  it('reports a chrome difference as drift: exit 1, and the path and runs in human output', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, chromePages: fixturePages('<div class="nav">New label</div>') });
    expect(exitCode(result.report)).toBe(1);
    const human = formatWatchReport(result.report);
    for (const finding of result.report.chrome?.findings ?? []) {
      expect(human).toContain(finding.path);
      for (const hunk of finding.hunks) for (const run of [...hunk.served, ...hunk.live]) expect(human).toContain(run);
    }
  });

  it('exits 0 when every served page’s chrome matches live', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, chromePages: fixturePages('<div class="nav">Old label</div>') });
    expect(result.report.chrome?.differed).toBe(0);
    expect(exitCode(result.report)).toBe(0);
  });

  it('counts allow-list hits in the report, never as silence', () => {
    const withStrip = '<div class="nav">Old label<a href="https://users.flocksafety.com/login" class="button">Sign In</a></div>';
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED, chromePages: fixturePages(withStrip) });
    expect(result.report.chrome?.hits).toEqual([{ name: 'account sign-in link', regions: 1, chars: 7 }]);
    expect(exitCode(result.report)).toBe(0);
  });

  it('leaves a run with no chrome input without a chrome tier', () => {
    const result = runWatch({ ...steady(), previous: null, accept: false, verified: VERIFIED });
    expect(result.report.chrome).toBeUndefined();
  });
});

// Ticket 04b: the runtime-fill exclusions. The chrome projection is the only
// tier these apply to — the copy projection still reads the prose inside the
// CMS list — so the whole set is a second, chrome-only list of named matchers,
// injectable exactly like the allow-list so a removal fixture can prove a
// stripped region re-reports.
describe('CHROME_RUNTIME_FILL — the regions a rendered capture fills and a raw fetch does not', () => {
  /** The live markup each runtime-fill class is recognized by. */
  const regions: Record<string, string> = {
    'marketo-form': '<form class="mktoForm mktoHasWidth mktoLayoutLeft"><label>First Name</label><button>Submit</button></form>',
    'finsweet-cms-hidden-tags': '<div fs-cmsfilter-element="list"><div class="hide"><div fs-cmsfilter-field="audiences">Transportation</div></div></div>',
    'webflow-pagination': '<div class="w-pagination-wrapper cs_pagination"><a>Previous</a><a class="w-pagination-current">1</a></div>',
    'ashby-jobs': '<div class="careers_filter">All Departments</div><div class="careers__listing"><div class="jobs-card_tag">Full Time</div></div>',
    'calculator-output': '<div><output class="rc-output bold">$780,000</output><span class="rc-result">$351,000</span></div>',
    'wistia-player-chrome': '<div class="wistia_popover_embed"><span>Press O for more options</span><button>Click for sound</button></div>',
    'podcast-player': '<div class="ep-player"><div class="tmplayer-element duration">62:54</div></div>',
  };

  it('names one entry per runtime-fill class it excludes', () => {
    expect(CHROME_RUNTIME_FILL.map((e) => e.name)).toEqual(Object.keys(regions));
  });

  it('strips every runtime-fill region from the projection', () => {
    for (const entry of CHROME_RUNTIME_FILL) {
      expect(chromeRuns(regions[entry.name]), entry.name).toEqual([]);
    }
  });

  it('makes an excluded region re-report when its exclusion is removed', () => {
    for (const entry of CHROME_RUNTIME_FILL) {
      const without = CHROME_RUNTIME_FILL.filter((e) => e.name !== entry.name);
      const finding = chromeFinding('/x', regions[entry.name], '', CHROME_ALLOW_LIST, without);
      expect(finding, entry.name).not.toBeNull();
      expect(finding?.hunks.length, entry.name).toBeGreaterThan(0);
    }
  });

  it('is chrome-only: the copy projection still reads the prose inside the CMS list', () => {
    // The whole point of a chrome-only list: the Finsweet list carries the
    // blog/FAQ prose the copy tier must keep reading, so it may not move into
    // the shared `isGenerated`.
    const html = '<div fs-cmsfilter-element="list"><h3>Card title</h3><div class="hide"><div fs-cmsfilter-field="audiences">Transportation</div></div></div>';
    expect(copyRuns(html)).toEqual(['Card title']);
    expect(chromeRuns(html)).toEqual([]);
  });

  it('keeps visible card chrome inside the list, stripping only the hidden tags', () => {
    // The FAQ question lives in `faq_trigger_text`, not `.hide`, so a real change
    // to it stays in the chrome comparison instead of vanishing from both tiers.
    const html = '<div fs-cmsfilter-element="list"><div class="faq_trigger_text" itemprop="name">What is Flock?</div><div class="hide"><div fs-cmsfilter-field="faq-category">General</div></div></div>';
    expect(chromeRuns(html)).toEqual(['What is Flock?']);
  });

  it('scopes the Finsweet strip to the list, leaving an unrelated .hide alone', () => {
    // The nav's own hidden template shares the `hide` class; the `within`
    // matcher must not swallow it.
    const html = '<div class="hide"><div>Nav template</div></div>';
    expect(chromeRuns(html)).toEqual(['Nav template']);
  });

  it('does not exclude the Finsweet filters form, so a renamed filter control still reports', () => {
    // /press-center, /resources and /upcoming-events renamed their dropdown
    // labels upstream and the filters form wraps those toggles; excluding it
    // would mask real drift the strip does not explain.
    const toggle = (label: string) => `<div fs-cmsfilter-element="filters"><div data-text="Region" class="filter_dropdown-toggle-text">${label}</div></div>`;
    expect(chromeFinding('/press-center', toggle('Region'), toggle('Location'))).not.toBeNull();
  });
});

// A sanity guard for the fixture helpers above: `buildWatchReport` is the index
// seam ticket 01 already pins; ticket 04 must not have changed what a steady run
// reports there.
describe('ticket 04 leaves the index seam alone', () => {
  it('a steady run still has no index findings', () => {
    const report = buildWatchReport(steady());
    expect(report.findings).toEqual({ added: [], removed: [] });
  });
});
