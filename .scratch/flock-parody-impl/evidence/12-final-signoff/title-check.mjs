// Ticket 12: verify the run's static titles, site-wide.
//
// The title-repair pass (`pipeline/recapture.mjs`) rewrites each capture's
// `<title>` to the fresh inventory's title, falling back to the prior
// inventory when the live site served an empty one (the Webflow republish
// regression). That pass logs what it changed; this check proves the *outcome*
// independently: for every page the run captured, the title in the capture now
// equals the intended title. It is the record's backstop, and it is what the
// signoff cites for "no page carries a swapped or blank title".
//
// Usage:
//   node title-check.mjs --run <captureRunDir> --inventory <fresh.csv>
//                        [--fallback-inventory <prior.csv>]
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTitle, parseCsvTable, parseInventoryCsv } from '../../../../pipeline/inventory.mjs';
import { urlToRel } from '../../../../pipeline/recapture.mjs';
import { makeArg, invokedDirectly } from '../../../../pipeline/cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

/** The rel paths the run captured, from its status CSV. */
function capturedRels(runDir) {
  const csv = fs.readFileSync(path.join(runDir, 'capture-status.csv'), 'utf8');
  return new Set(
    parseCsvTable(csv)
      .filter((r) => r.verdict === 'saved' || r.verdict === 'skipped-existing')
      .map((r) => r.rel),
  );
}

function main(argv) {
  const getArg = makeArg(argv);
  const runDir = path.resolve(ROOT, getArg('--run') ?? '');
  const inventory = getArg('--inventory');
  const fallback = getArg('--fallback-inventory');
  if (!inventory) throw new Error('usage: title-check.mjs --run <dir> --inventory <csv> [--fallback-inventory <csv>]');

  const rows = parseInventoryCsv(fs.readFileSync(path.resolve(ROOT, inventory), 'utf8')).filter((r) => r.status === '200');
  const fallbackRows = fallback ? parseInventoryCsv(fs.readFileSync(path.resolve(ROOT, fallback), 'utf8')) : [];
  const fallbackTitle = new Map(fallbackRows.filter((r) => r.status === '200' && r.title.trim() !== '').map((r) => [urlToRel(r.url), r.title]));
  const captured = capturedRels(runDir);

  const mismatches = [];
  let blankFresh = 0;
  let noTitle = 0;
  for (const row of rows) {
    const rel = urlToRel(row.url);
    if (!captured.has(rel)) continue;
    const fresh = row.title.trim();
    const target = fresh !== '' ? fresh : (fallbackTitle.get(rel) ?? '');
    if (fresh === '') blankFresh += 1;
    if (target === '') noTitle += 1;
    const actual = extractTitle(fs.readFileSync(path.join(runDir, rel), 'utf8'));
    if (actual !== target) mismatches.push({ rel, expected: target, actual });
  }

  console.log(`checked ${[...captured].length} captured page(s); ${blankFresh} had a blank live title (took the fallback), ${noTitle} had no title available at all`);
  if (mismatches.length === 0) {
    console.log('title check: clean — every captured page carries its intended title');
    return 0;
  }
  for (const m of mismatches) console.log(`  MISMATCH ${m.rel}\n    expected: ${JSON.stringify(m.expected)}\n    actual:   ${JSON.stringify(m.actual)}`);
  console.log(`title check: ${mismatches.length} mismatch(es)`);
  return 1;
}

if (invokedDirectly(import.meta.url)) process.exit(main(process.argv.slice(2)));
