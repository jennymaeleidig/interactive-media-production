// HISTORICAL — the `headerRestorePass` this audits was retired by ticket 15
// (2026-09-11): the corrected-flags capture carries the header natively, so
// build-log no longer emits `menusFilled` / `mobileChrome` and this script has
// nothing to read. Kept as the ticket-14 record.
import fs from 'node:fs';
const log = JSON.parse(fs.readFileSync('served/build-log.json', 'utf8'));
const entries = Array.isArray(log) ? log : log.pages || log.log || [];
console.log('entries:', entries.length);
const counts = { menusFilled: {}, mobileChrome: {} };
let headerPages = 0;
const warnings = [];
for (const e of entries) {
  const hr = e.headerRestore;
  if (hr) {
    headerPages += 1;
    counts.menusFilled[hr.menusFilled] = (counts.menusFilled[hr.menusFilled] || 0) + 1;
    counts.mobileChrome[hr.mobileChrome] = (counts.mobileChrome[hr.mobileChrome] || 0) + 1;
  }
  for (const w of e.warnings || []) if (/header restore/.test(w)) warnings.push(`${e.page}: ${w}`);
}
console.log('pages with a header graft:', headerPages);
console.log('menusFilled histogram:', counts.menusFilled);
console.log('mobileChrome histogram:', counts.mobileChrome);
console.log('header-restore warnings:', warnings.length);
for (const w of warnings.slice(0, 10)) console.log(' -', w);
