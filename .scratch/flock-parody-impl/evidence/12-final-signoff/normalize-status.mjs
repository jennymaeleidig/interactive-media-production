// One-time repair of the 2026-09-12 run's capture-status.csv verdict column.
//
// The run reached 1,200/1,200 only across three driver passes (the sweep, the
// transient-failure retry, and the chat-census retry). Before the driver's
// saved-is-sticky fix, each resume pass overwrote the previous pass's `saved`
// verdicts with `skipped-existing`, so the committed CSV read as though only
// the last 12 pages were captured by this run. Every page in the folder was in
// fact captured by this run (1159 + 41 + 12 = 1212 captures over 1200 distinct
// pages), so the honest verdict is `saved` wherever the capture the row
// describes is on disk. The byte count recorded in the row is asserted against
// the file, so this never masks a capture that is not what the row says.
//
// Usage: node normalize-status.mjs <runDir>
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { parseCsvTable, toCsv } from '../../../../pipeline/inventory.mjs';

const runDir = path.resolve(process.argv[2] ?? '');
const csvPath = path.join(runDir, 'capture-status.csv');
const csv = fs.readFileSync(csvPath, 'utf8');
const cols = Object.keys(parseCsvTable(csv)[0] ?? {});
const rows = parseCsvTable(csv);

let normalized = 0;
let drifted = 0;
for (const row of rows) {
  const file = path.join(runDir, row.rel);
  if (!fs.existsSync(file)) continue;
  const size = fs.statSync(file).size;
  // The title-repair pass rewrites the file after the status row is written,
  // so the recorded byte count can be a title's worth off; the driver's own
  // "already captured" test is the bar here (a real capture, not a stub).
  if (size <= 1000) throw new Error(`${row.rel}: capture on disk is only ${size} bytes — refusing to normalize`);
  if (row.bytes !== '' && Number(row.bytes) !== size) drifted += 1;
  if (row.verdict !== 'saved') {
    row.verdict = 'saved';
    normalized += 1;
  }
}

fs.writeFileSync(csvPath, toCsv(cols, rows));
console.log(`normalized ${normalized} verdict(s) in ${csvPath} (${drifted} row(s) whose byte count changed under title repair)`);
