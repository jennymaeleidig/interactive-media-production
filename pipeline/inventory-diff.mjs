// The inventory diff pass (ticket 11, step 2): old inventory vs fresh
// inventory → what changed, exactly what needs re-capturing, and the route
// actions the removals and demotions drive.
//
// Pure: CSV rows in, report + scope list + actions out. The CLI reads and
// writes files; nothing here touches the network.
//
// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs';
import path from 'node:path';
import { makeArg, invokedDirectly } from './cli.mjs';
import { inventoryDir, inventoryCsvPath, localDate, parseInventoryCsv, toCsv } from './inventory.mjs';

/**
 * @typedef {import('./inventory.mjs').InventoryRow} InventoryRow
 * @typedef {{ path: string, classes: string[], old: InventoryRow, new: InventoryRow }} ChangedRow
 * @typedef {{ path: string, action: 'drop-route' | 'redirect', target: string, reason: string }} RouteAction
 */

/** The class order used in the report and the CSV's `change` column. */
const CLASS_ORDER = ['retitled', 'status-changed', 'nav-changed', 'type-changed'];

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** A live page is exactly `200` — redirect stubs, dead roots, and auth-gated stubs are not. */
const isLive = (row) => row.status === '200';

/**
 * Diff two inventories, keyed on `path`.
 *
 * - `added` / `removed` are whole rows.
 * - `changed` carries the class set per surviving path; the grouped arrays
 *   (`retitled`, `statusChanged`, `navChanged`, `typeChanged`) are views of it,
 *   so a path can appear in more than one group.
 * - `nav`/`type` drift is advisory: it drives no capture action (the runbook
 *   says sitemap/nav membership changes alone are not page changes).
 *
 * @param {InventoryRow[]} oldRows
 * @param {InventoryRow[]} newRows
 */
export function diffInventories(oldRows, newRows) {
  const oldByPath = new Map(oldRows.map((r) => [r.path, r]));
  const newByPath = new Map(newRows.map((r) => [r.path, r]));

  /** @type {InventoryRow[]} */
  const added = newRows.filter((r) => !oldByPath.has(r.path)).sort(byPath);
  /** @type {InventoryRow[]} */
  const removed = oldRows.filter((r) => !newByPath.has(r.path)).sort(byPath);

  /** @type {ChangedRow[]} */
  const changed = [];
  for (const [p, oldRow] of oldByPath) {
    const newRow = newByPath.get(p);
    if (!newRow) continue;
    const classes = [];
    if (oldRow.title !== newRow.title) classes.push('retitled');
    if (oldRow.status !== newRow.status || oldRow.redirect_target !== newRow.redirect_target) classes.push('status-changed');
    if (oldRow.nav !== newRow.nav) classes.push('nav-changed');
    if (oldRow.type !== newRow.type) classes.push('type-changed');
    if (classes.length > 0) changed.push({ path: p, classes, old: oldRow, new: newRow });
  }
  changed.sort(byPath);

  const grouped = (cls) => changed.filter((c) => c.classes.includes(cls));
  const diff = {
    added,
    removed,
    changed,
    retitled: grouped('retitled'),
    statusChanged: grouped('status-changed'),
    navChanged: grouped('nav-changed'),
    typeChanged: grouped('type-changed'),
    counts: {
      old: oldRows.length,
      new: newRows.length,
      added: added.length,
      removed: removed.length,
      retitled: grouped('retitled').length,
      statusChanged: grouped('status-changed').length,
      navChanged: grouped('nav-changed').length,
      typeChanged: grouped('type-changed').length,
      unchanged: newRows.length - added.length - changed.length,
    },
  };
  return diff;
}

/**
 * The pages to re-capture immediately: every added live page, every retitled
 * live page, and every page that became live. Removed and demoted pages are
 * route actions, never captures.
 * @param {ReturnType<typeof diffInventories>} diff
 * @returns {InventoryRow[]}
 */
export function recaptureScope(diff) {
  const out = new Map();
  for (const row of diff.added) if (isLive(row)) out.set(row.path, row);
  for (const c of diff.changed) {
    if (!isLive(c.new)) continue;
    const newlyLive = c.classes.includes('status-changed') && !isLive(c.old);
    if (c.classes.includes('retitled') || newlyLive) out.set(c.path, c.new);
  }
  return [...out.values()].sort(byPath);
}

/**
 * Route actions for pages that were live and no longer are: drop the route
 * (404/410) or follow the site's new redirect. A removed redirect stub was
 * never a Recreation route, so it yields no action.
 * @param {ReturnType<typeof diffInventories>} diff
 * @returns {RouteAction[]}
 */
export function routeActions(diff) {
  /** @type {RouteAction[]} */
  const actions = [];
  for (const row of diff.removed) {
    if (isLive(row)) actions.push({ path: row.path, action: 'drop-route', target: '', reason: 'removed from live inventory' });
  }
  for (const c of diff.changed) {
    if (!isLive(c.old) || isLive(c.new)) continue;
    if (c.new.status === '200 (redirect)') {
      actions.push({ path: c.path, action: 'redirect', target: c.new.redirect_target, reason: 'live page now redirects' });
    } else {
      actions.push({ path: c.path, action: 'drop-route', target: '', reason: `live page now ${c.new.status}` });
    }
  }
  return actions.sort(byPath);
}

/**
 * The diff as a CSV: one row per changed path (a multi-class path appears once,
 * its classes joined with `;`).
 * @param {ReturnType<typeof diffInventories>} diff
 * @returns {string}
 */
export function formatDiffCsv(diff) {
  const actions = new Map(routeActions(diff).map((a) => [a.path, a]));
  const fields = [
    'path', 'change', 'old_status', 'new_status', 'old_title', 'new_title',
    'old_nav', 'new_nav', 'old_type', 'new_type', 'redirect_target', 'action',
  ];
  const rows = [];
  const actionCell = (p) => actions.get(p)?.action ?? '';
  for (const row of diff.added) {
    rows.push({
      path: row.path, change: 'added', old_status: '', new_status: row.status, old_title: '', new_title: row.title,
      old_nav: '', new_nav: row.nav, old_type: '', new_type: row.type, redirect_target: row.redirect_target, action: '',
    });
  }
  for (const row of diff.removed) {
    rows.push({
      path: row.path, change: 'removed', old_status: row.status, new_status: '', old_title: row.title, new_title: '',
      old_nav: row.nav, new_nav: '', old_type: row.type, new_type: '', redirect_target: '', action: actionCell(row.path),
    });
  }
  for (const c of diff.changed) {
    const classes = CLASS_ORDER.filter((cls) => c.classes.includes(cls));
    rows.push({
      path: c.path, change: classes.join(';'), old_status: c.old.status, new_status: c.new.status,
      old_title: c.old.title, new_title: c.new.title, old_nav: c.old.nav, new_nav: c.new.nav,
      old_type: c.old.type, new_type: c.new.type, redirect_target: c.new.redirect_target, action: actionCell(c.path),
    });
  }
  rows.sort(byPath);
  return toCsv(fields, rows);
}

/**
 * The human-readable diff report. Counts first, then the immediate re-capture
 * list, then the route actions, then advisory nav/type drift.
 * @param {ReturnType<typeof diffInventories>} diff
 * @param {{ oldLabel: string, newLabel: string }} labels
 * @returns {string}
 */
export function renderDiffMarkdown(diff, { oldLabel, newLabel }) {
  const { counts } = diff;
  const lines = [];
  lines.push(`# Inventory diff — ${oldLabel} → ${newLabel}`, '');
  lines.push(`Old inventory: ${counts.old} row(s) · fresh inventory: ${counts.new} row(s)`, '');
  lines.push('| change class | count |', '| --- | ---: |');
  for (const cls of ['added', 'removed', 'retitled', 'statusChanged', 'navChanged', 'typeChanged', 'unchanged']) {
    lines.push(`| ${cls} | ${counts[cls]} |`);
  }

  lines.push('', '## Re-capture immediately (added + retitled + newly-live)', '');
  const scope = recaptureScope(diff);
  if (scope.length === 0) lines.push('_No live pages changed — nothing to re-capture._');
  for (const row of scope) {
    const c = diff.changed.find((e) => e.path === row.path);
    const why = diff.added.some((e) => e.path === row.path) ? 'added' : c?.classes.includes('retitled') ? 'retitled' : 'newly-live';
    lines.push(`- \`${row.path}\` (${why}) — "${row.title}"`);
  }

  lines.push('', '## Route actions (removed / demoted live pages)', '');
  const actions = routeActions(diff);
  if (actions.length === 0) lines.push('_None._');
  for (const a of actions) lines.push(`- \`${a.path}\` → **${a.action}**${a.target ? ` ${a.target}` : ''} (${a.reason})`);

  lines.push('', '## Advisory drift (no capture action)', '');
  lines.push(`nav membership: ${counts.navChanged} · type: ${counts.typeChanged}`, '');
  if (counts.navChanged + counts.typeChanged > 0) {
    lines.push('| path | nav | type |', '| --- | --- | --- |');
    for (const c of [...diff.navChanged, ...diff.typeChanged].filter((c, i, a) => a.findIndex((x) => x.path === c.path) === i)) {
      lines.push(`| \`${c.path}\` | ${c.old.nav} → ${c.new.nav} | ${c.old.type} → ${c.new.type} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ---- paths -------------------------------------------------------------------

/** The diff report beside the fresh inventory. */
export function diffMdPath(runDate) {
  return `${inventoryDir()}/${runDate}-diff.md`;
}

/** The diff CSV beside the fresh inventory. */
export function diffCsvPath(runDate) {
  return `${inventoryDir()}/${runDate}-diff.csv`;
}

/** The re-capture scope list beside the fresh inventory (one URL per line). */
export function recaptureListPath(runDate) {
  return `${inventoryDir()}/${runDate}-recapture.txt`;
}

// ---- CLI ---------------------------------------------------------------------

async function main() {
  const arg = makeArg(process.argv.slice(2));
  const runDate = arg('--date') ?? localDate();
  const oldFile = arg('--old');
  const newFile = arg('--new') ?? inventoryCsvPath(runDate);
  if (!oldFile) {
    console.error('usage: node pipeline/inventory-diff.mjs --old <previous.csv> [--new <fresh.csv>] [--date YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }
  const diff = diffInventories(parseInventoryCsv(fs.readFileSync(oldFile, 'utf8')), parseInventoryCsv(fs.readFileSync(newFile, 'utf8')));
  const labels = { oldLabel: arg('--old-label') ?? path.basename(oldFile).replace(/\.csv$/, ''), newLabel: arg('--new-label') ?? runDate };
  const scope = recaptureScope(diff);

  fs.mkdirSync(inventoryDir(), { recursive: true });
  fs.writeFileSync(diffMdPath(runDate), renderDiffMarkdown(diff, labels));
  fs.writeFileSync(diffCsvPath(runDate), formatDiffCsv(diff));
  fs.writeFileSync(recaptureListPath(runDate), scope.map((r) => r.url).join('\n') + (scope.length ? '\n' : ''));

  console.log(`diff ${labels.oldLabel} → ${labels.newLabel}: ${scope.length} to re-capture, ${routeActions(diff).length} route action(s)`);
  console.log(`wrote ${diffMdPath(runDate)}, ${diffCsvPath(runDate)}, ${recaptureListPath(runDate)}`);
  if (diff.counts.navChanged + diff.counts.typeChanged > 0) {
    console.log(`advisory drift: ${diff.counts.navChanged} nav, ${diff.counts.typeChanged} type (no capture action)`);
  }
}

if (invokedDirectly(import.meta.url)) await main();
