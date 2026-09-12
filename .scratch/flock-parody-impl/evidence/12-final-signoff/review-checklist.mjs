// Ticket 12: the human side-by-side review pack.
//
// The one check no automated gate covers is runtime feel and the *visual*
// strip result on a representative page set (the ticket's "Review sample").
// This script turns that sample into a concrete checklist: for every page it
// resolves the served path against a capture run and the `file://` path of the
// capture it must read identically to, and records the capture's size so a
// missing/short page is obvious before a human ever opens a browser.
//
// Usage:
//   node review-checklist.mjs [--run <captureRunDir>] [--base <origin>]
//                             [--out <path>]
// Defaults: --run the build's CAPTURE_RUN, --base http://localhost:3000,
// --out beside this script.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_RUN } from '../../../../pipeline/config.mjs';
import { urlToRel } from '../../../../pipeline/recapture.mjs';
import { makeArg, invokedDirectly } from '../../../../pipeline/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SITE = 'https://www.flocksafety.com';

// The ticket's Review sample: one page per template family plus the largest
// and hardest cases. Keep in sync with
// `.scratch/flock-parody-impl/issues/12-final-fidelity-signoff.md`.
const SAMPLE = {
  index: ['/', '/blog', '/customers', '/resources', '/trust', '/press-center', '/upcoming-events'],
  marketing: ['/industries/retail', '/gsx', '/flock-ecosystem', '/what-is-flock'],
  product: [
    '/products/license-plate-readers',
    '/products/video-cameras',
    '/products/flock-os',
    '/products/gunshot-detection',
    '/products/mobile-security-trailer',
    '/products/flock-dfr',
    '/safe-cities',
  ],
  post: [
    '/blog/how-effective-is-flock',
    '/blog/tips-for-leaving-town',
    '/blog/why-flock',
    '/customers/how-spring-branch-independent-school-district-is-stopping-crime-with-a-flock-safety-falcon-and-raven-system',
  ],
  resource: ['/ebooks/apartment-security', '/webinar/product-launch', '/podcast'],
  legal: ['/legal/terms-and-conditions', '/legal/privacy-policy'],
  utility: [
    '/book-a-demo',
    '/thank-you',
    '/newsletter',
    '/partner-inquiry',
    '/refer',
    '/chilipiper-2',
    '/accessibility-plan',
  ],
  'campaign LP': ['/lp/proven-where-it-matters', '/abm/amazon'],
  'long-form utility': ['/implementation-guide'],
};

/** A URL path to the capture file the run stores it at. */
function captureFile(runDir, urlPath) {
  return path.join(runDir, urlToRel(`${SITE}${urlPath}`));
}

function main(argv) {
  const getArg = makeArg(argv);
  const runDir = path.resolve(ROOT, getArg('--run') ?? CAPTURE_RUN);
  const base = getArg('--base') ?? 'http://localhost:3000';
  const out = getArg('--out') ?? path.join(HERE, 'review-checklist.md');

  const lines = [
    '# Ticket 12 human review pack',
    '',
    `Capture run: \`${path.relative(ROOT, runDir)}\``,
    '',
    'Two windows, side by side, per row: the **served** page (the build under',
    `review, at \`${base}\`) and the **capture** (\`file://\` — a SingleFile`,
    'capture is self-contained, so it renders straight from disk). Both should',
    'read as the same page.',
    '',
    '## Strip checks (every row, by eye)',
    '',
    '- No Qualified offer bar (bottom-right overlay / inline offer card).',
    '- No OneTrust consent card or cookie banner.',
    '- The header sits flush at the top — no reclaimed-height gap where a',
    '  stripped banner used to be.',
    '- Nothing else has moved: same layout, imagery, and type as the capture.',
    '',
  ];
  let missing = 0;
  for (const [family, paths] of Object.entries(SAMPLE)) {
    lines.push(`## ${family}`, '');
    for (const p of paths) {
      const file = captureFile(runDir, p);
      const exists = fs.existsSync(file);
      const size = exists ? fs.statSync(file).size : 0;
      if (!exists) missing += 1;
      const served = `${base}${p}`;
      const capture = `file://${file}`;
      lines.push(
        exists
          ? `- [ ] \`${p}\` — [served](${served}) · [capture](${capture}) · ${(size / 1e6).toFixed(1)} MB`
          : `- [ ] \`${p}\` — **MISSING from run** (${path.relative(ROOT, file)})`,
      );
    }
    lines.push('');
  }
  lines.push(
    '## Runtime feel (per row, where the page has it)',
    '',
    '- Motion: scroll-reveal, hover states, header morph on scroll.',
    '- Interactive widgets: menus, tabs, accordions, sliders, filters.',
    '- Chat: launcher opens, panel renders, a message round-trips.',
    '- Video: YouTube slots reveal and play (ticket 17); the Wistia slots the',
    '  spec leaves as captured stay in their captured end-state.',
    '',
    '## Verdict',
    '',
    '- [ ] Side-by-side reads as the same site on every row.',
    '- [ ] Strip result confirmed by eye on every row.',
    '- [ ] Runtime feel confirmed (animations, chat overlay, pounce timing).',
    '- [ ] Divergences seen are the ones the spec accepts (5 dead Wistia',
    '      medias, the 2 tier-3 scrub-driven timelines, wheel smoothing).',
    '',
  );

  fs.writeFileSync(out, lines.join('\n'));
  console.log(`${out}: ${Object.values(SAMPLE).flat().length} pages, ${missing} missing`);
  return missing > 0 ? 1 : 0;
}

if (invokedDirectly(import.meta.url)) process.exit(main(process.argv.slice(2)));
