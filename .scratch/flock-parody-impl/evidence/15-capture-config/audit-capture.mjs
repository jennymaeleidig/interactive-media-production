// Ticket 15 evidence tool: diff the 2026-09-09 default-flags capture run
// against the corrected-flags run, per component family, and site-wide.
//
// The corrected run was captured with
//   --remove-hidden-elements=false --remove-unused-styles=false
// so it keeps subtrees not rendered at capture time (closed menus, take-overs,
// modal panels) and CSS rules matching no element at capture time (every
// open/active state). This tool measures what came back.
//
// Usage: node audit-capture.mjs <oldRunDir> <newRunDir> [--json <path>]
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Every capture file in a run dir, as repo-relative-ish paths. */
function captureFiles(runDir) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(path.relative(runDir, p));
    }
  };
  walk(runDir);
  return out.sort();
}

const count = (html, re) => (html.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) || []).length;
const has = (html, re) => re.test(html);

// ---- markers ----------------------------------------------------------------
// Hidden-element artifact (SingleFile's removeHiddenElements marker) and the
// state vocabulary the captures lost. Each marker is a named count or flag.
const MARKERS = {
  // the SingleFile artifact class — must be nonzero only in the old run
  sfHidden: { re: /\bsf-hidden\b/g, kind: 'count' },
  sfHiddenRule: { re: /\.sf-hidden\s*\{/, kind: 'flag' },
  // Webflow's base hide rule, absent from the old run even though elements
  // carry the class
  wConditionRule: { re: /\.w-condition-invisible\s*\{[^}]*display\s*:\s*none/, kind: 'flag' },
  wConditionEls: { re: /class=("|')?[^"'>]*\bw-condition-invisible\b/g, kind: 'count' },
  // shared-header state CSS
  navShowRule: { re: /\.nav__dd\.show[^{]*\{/, kind: 'flag' },
  headerScrollRule: { re: /\.header-z\.scroll[^{]*\{/, kind: 'flag' },
  headerBgOpenRule: { re: /\.header__bg\.is-open[^{]*\{/, kind: 'flag' },
  headerSticky: { re: /\.header-wr\s*\{[^}]*position\s*:\s*sticky[^}]*top\s*:\s*0/, kind: 'flag' },
  // other base rules the hidden subtrees' families need
  wDropdownNoneRule: { re: /\.w-dropdown-list\s*\{[^}]*display\s*:\s*none/, kind: 'flag' },
  wDropdownOpenRule: { re: /\.w-dropdown-list\.w--open\s*\{[^}]*display\s*:\s*block/, kind: 'flag' },
  wTabPaneNoneRule: { re: /\.w-tab-pane\s*\{[^}]*display\s*:\s*none/, kind: 'flag' },
  wTabActiveRule: { re: /\.w--tab-active\s*\{[^}]*display\s*:\s*block/, kind: 'flag' },
  hasSelectors: { re: /:has\(/, kind: 'flag' },
  // hidden-subtree element counts (the recovered families). Class markers
  // require the class ATTRIBUTE, so a CSS selector in the inlined stylesheet
  // (always present in the corrected run) is not miscounted as an element.
  navDdContent: { re: /class=("|')?[^"'>]*\bnav__dd-content\b/g, kind: 'count' },
  navDdEmpty: { re: /class="nav__dd-content[^"]*"><\/div>/g, kind: 'count' },
  mobileChrome: { re: /class=("|')?[^"'>]*\bnav-menu-mobile-wr\b/g, kind: 'count' },
  mobileCta: { re: /class=("|')?[^"'>]*\bis-cta-mobile\b/g, kind: 'count' },
  wDropdownToggle: { re: /class=("|')?[^"'>]*\bw-dropdown-toggle\b/g, kind: 'count' },
  wDropdownList: { re: /class=("|')?[^"'>]*\bw-dropdown-list\b/g, kind: 'count' },
  wTabPane: { re: /class=("|')?[^"'>]*\bw-tab-pane\b/g, kind: 'count' },
  wTabLink: { re: /class=("|')?[^"'>]*\bw-tab-link\b/g, kind: 'count' },
  customTabs: { re: /(?<!\[)\bdata-tabs=[^\s>]+(?=[\s>])/g, kind: 'count' },
  accordionToggle: { re: /(?<!\[)\bdata-accordion-toggle\b/g, kind: 'count' },
  sliderControls: { re: /(?<!\[)\bdata-slider=|data-swiper-prev|data-swiper-next/g, kind: 'count' },
};

/** Marker values for one page. */
function measure(html) {
  const out = {};
  for (const [name, { re, kind }] of Object.entries(MARKERS)) {
    out[name] = kind === 'flag' ? (has(html, re) ? 1 : 0) : count(html, re);
  }
  return out;
}

// ---- component families -----------------------------------------------------
// One representative page per family the ticket names, plus the markers that
// family's recovery turns on.
const FAMILIES = [
  { name: 'Shared header mega-menu', page: 'index.html', keys: ['navDdContent', 'navDdEmpty', 'navShowRule', 'headerScrollRule', 'headerBgOpenRule', 'headerSticky', 'hasSelectors'] },
  { name: 'Mobile take-over', page: 'index.html', keys: ['mobileChrome', 'mobileCta', 'bgOpen' /* alias below */] },
  { name: 'Webflow dropdown / FAQ (animated height)', page: 'products/flock-os.html', keys: ['wDropdownToggle', 'wDropdownList', 'wDropdownOpenRule'] },
  { name: 'Press-center filters (display:none shape)', page: 'press-center.html', keys: ['wDropdownToggle', 'wDropdownList', 'wDropdownNoneRule', 'wDropdownOpenRule'] },
  { name: 'Webflow tabs', page: 'products/video-cameras.html', keys: ['wTabLink', 'wTabPane', 'wTabPaneNoneRule', 'wTabActiveRule'] },
  { name: 'Custom tabs (data-tabs menu/content pairs)', page: 'flock-ecosystem.html', keys: ['customTabs'] },
  { name: 'Accordions (LPR accordion-css)', page: 'trust.html', keys: ['accordionToggle'] },
  { name: 'Sliders (Swiper)', page: 'press-center.html', keys: ['sliderControls'] },
  { name: 'Condition-hidden CMS variants', page: 'resources.html', keys: ['wConditionEls', 'wConditionRule'] },
];

// `bgOpen` is not a marker name; normalize the family key list.
const KEY_ALIAS = { bgOpen: 'headerBgOpenRule' };

function fmt(v) {
  return typeof v === 'number' ? String(v) : String(v);
}

function main() {
  const [oldDir, newDir] = process.argv.slice(2);
  if (!oldDir || !newDir) {
    console.error('usage: audit-capture.mjs <oldRunDir> <newRunDir> [--json <path>]');
    process.exitCode = 1;
    return;
  }
  const files = captureFiles(newDir);
  // site-wide aggregate over pages present in both runs
  const totals = {};
  for (const name of Object.keys(MARKERS)) totals[name] = { old: 0, new: 0 };
  let paired = 0;
  let missingOld = 0;
  const perPage = [];
  for (const rel of files) {
    const newFile = path.join(newDir, rel);
    const oldFile = path.join(oldDir, rel);
    if (!existsSync(oldFile)) { missingOld += 1; continue; }
    const a = measure(readFileSync(oldFile, 'utf8'));
    const b = measure(readFileSync(newFile, 'utf8'));
    paired += 1;
    for (const name of Object.keys(MARKERS)) { totals[name].old += a[name]; totals[name].new += b[name]; }
    perPage.push({ page: rel, old: a, new: b });
  }

  console.log(`# Capture recovery audit — 2026-09-09 (defaults) vs corrected run`);
  console.log('');
  console.log(`Paired captures (present in both runs): **${paired}** (${missingOld} new-only pages skipped).`);
  console.log('');
  console.log('## Site-wide markers');
  console.log('');
  console.log('| marker | 2026-09-09 | corrected | what it means |');
  console.log('| --- | ---: | ---: | --- |');
  const MEANING = {
    sfHidden: 'SingleFile hidden-element artifact class',
    sfHiddenRule: 'the artifact class’s hide rule',
    wConditionRule: 'Webflow base hide rule for condition variants',
    wConditionEls: 'elements carrying the condition-hidden class',
    navShowRule: 'shared-header dropdown open state',
    headerScrollRule: 'shared-header scrolled state',
    headerBgOpenRule: 'shared-header mobile take-over state',
    headerSticky: 'shared-header sticky offset (top:0)',
    wDropdownNoneRule: 'Webflow dropdown base hide rule',
    wDropdownOpenRule: 'Webflow dropdown open rule',
    wTabPaneNoneRule: 'Webflow tab-pane base hide rule',
    wTabActiveRule: 'Webflow active tab-pane rule',
    hasSelectors: ':has() selectors (header state rules use them)',
    navDdContent: 'mega-menu panel containers',
    navDdEmpty: 'empty mega-menu panel containers',
    mobileChrome: 'mobile take-over chrome containers',
    mobileCta: 'mobile take-over CTA rows',
    wDropdownToggle: 'Webflow dropdown toggles',
    wDropdownList: 'Webflow dropdown lists',
    wTabPane: 'Webflow tab panes',
    wTabLink: 'Webflow tab links',
    customTabs: 'custom tab elements (data-tabs)',
    accordionToggle: 'accordion toggles',
    sliderControls: 'slider controls',
  };
  for (const name of Object.keys(MARKERS)) {
    console.log(`| ${name} | ${totals[name].old} | ${totals[name].new} | ${MEANING[name] ?? ''} |`);
  }
  console.log('');
  console.log('## Per component family');
  for (const fam of FAMILIES) {
    const rel = fam.page;
    const row = perPage.find((p) => p.page === rel);
    console.log('');
    console.log(`### ${fam.name} — \`/${rel.replace(/\.html$/, '').replace(/^index$/, '')}\``);
    console.log('');
    console.log(`| marker | 2026-09-09 | corrected |`);
    console.log('| --- | ---: | ---: |');
    if (!row) {
      console.log('| _(page missing from the paired set)_ | | |');
      continue;
    }
    for (const key0 of fam.keys) {
      const key = KEY_ALIAS[key0] ?? key0;
      console.log(`| ${key} | ${fmt(row.old[key])} | ${fmt(row.new[key])} |`);
    }
  }

  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
    writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ paired, missingOld, totals, perPage }, null, 2));
  }
}

main();
