// The mutation log owns its summary projection (architecture-deepening ticket
// 05). Every pass writes its own optional slice of the log (LogEntry); the
// whole-site summary is derived from those slices here and only here, so the
// build, `--dedupe-tree`, and the CLI cannot drift, and a new metric is one row
// in SUMMARY_GROUPS rather than a new reduce in build.mjs.
//
// The JSON key names, nesting, and key order are the compatibility surface:
// build-summary.json is read by regression/routes.mjs and the serving layer, so
// project() reproduces the exact shape the hand-written literal had.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Every whole-site number the summary derives from the per-page mutation log,
 * declared once. Each group is either a scalar (`scalar`) or a set of named
 * fields (`metrics`), in the key order build-summary.json uses. A field's
 * `from` is the dotted key on a served LogEntry; `kind` is how the entries
 * fold:
 *
 *  - `sum`    — add the value across entries (a missing slice is 0)
 *  - `count`  — entries where the value is positive/truthy
 *  - `absent` — the served entries minus the `count`
 *
 * Adding a metric is one row here; `project` needs no change (proven by
 * `test/summary.test.ts`).
 */
export const SUMMARY_GROUPS = [
  {
    group: 'chat',
    metrics: [
      { key: 'mounted', from: 'chatLauncher', kind: 'count' },
      { key: 'absent', from: 'chatLauncher', kind: 'absent' },
    ],
  },
  { group: 'originalUrls', scalar: { from: 'originalUrls', kind: 'sum' } },
  {
    // ADR 0003 — the body accounting. The entry-folded fields are declared
    // here; `files`/`bytes` come from the files the pass wrote, added by
    // `bodyTotals` below so the build and `--dedupe-tree` agree.
    group: 'bodies',
    metrics: [
      { key: 'styles', from: 'deduped.style', kind: 'sum' },
      { key: 'scripts', from: 'deduped.script', kind: 'sum' },
      { key: 'kept', from: 'deduped.kept', kind: 'sum' },
      { key: 'bytesIn', from: 'deduped.bytesIn', kind: 'sum' },
      { key: 'bytesOut', from: 'deduped.bytesOut', kind: 'sum' },
    ],
  },
  {
    // ADR 0002 — `references` folds the log; `distinct`/`bytes` are the files
    // on disk, added by `assetTotals`.
    group: 'assets',
    metrics: [{ key: 'references', from: 'assets.references', kind: 'sum' }],
  },
  {
    group: 'embeds',
    metrics: [
      { key: 'live', from: 'embeds.live', kind: 'sum' },
      { key: 'pages', from: 'embeds.live', kind: 'count' },
      { key: 'srcdoc', from: 'embeds.srcdoc', kind: 'sum' },
      { key: 'element', from: 'embeds.element', kind: 'sum' },
      { key: 'component', from: 'embeds.component', kind: 'sum' },
      { key: 'frame', from: 'embeds.frame', kind: 'sum' },
      { key: 'popover', from: 'embeds.popover', kind: 'sum' },
      { key: 'dead', from: 'embeds.dead', kind: 'sum' },
      { key: 'youtube', from: 'embeds.youtube', kind: 'sum' },
      { key: 'vidzflow', from: 'embeds.vidzflow', kind: 'sum' },
      { key: 'unreachable', from: 'embeds.unreachable', kind: 'sum' },
    ],
  },
];

/**
 * One row of the metric table: a scalar group or a group of named fields.
 * @typedef {{group: string, scalar?: {from: string, kind: string}, metrics?: Array<{key: string, from: string, kind: string}>}} SummaryGroup
 */

/**
 * Read a dotted key off an object; undefined when any hop is missing.
 */
function pick(obj, dotted) {
  let value = obj;
  for (const key of dotted.split('.')) {
    if (value == null) return undefined;
    value = value[key];
  }
  return value;
}

/** How the entries fold for one metric kind. */
const FOLDS = {
  sum: (entries, from) => entries.reduce((n, e) => n + (pick(e, from) ?? 0), 0),
  count: (entries, from) => entries.filter((e) => (pick(e, from) ?? 0) > 0).length,
  absent: (entries, from) => entries.length - entries.filter((e) => (pick(e, from) ?? 0) > 0).length,
};

/** Fold the log into the summary groups, in the table's order. */
function projectGroups(servedEntries, groups) {
  const out = {};
  for (const group of groups) {
    if (group.scalar) {
      out[group.group] = FOLDS[group.scalar.kind](servedEntries, group.scalar.from);
      continue;
    }
    const slice = {};
    for (const { key, from, kind } of group.metrics) slice[key] = FOLDS[kind](servedEntries, from);
    out[group.group] = slice;
  }
  return out;
}

/** Sum the on-disk size of a set of content-addressed asset names. */
export function bytesOnDisk(assetDir, names) {
  let total = 0;
  for (const name of names) total += fs.statSync(path.join(assetDir, name)).size;
  return total;
}

/**
 * The ADR-0003 body accounting, keyed and ordered as build-summary.json
 * expects. Shared by `project` and `--dedupe-tree`, which recompute the same
 * group from a tree walk.
 * @param {string} assetDir
 * @param {Set<string>} files  The body files this operation wrote.
 * @param {{styles: number, scripts: number, kept: number, bytesIn: number, bytesOut: number}} totals
 */
export function bodyTotals(assetDir, files, { styles, scripts, kept, bytesIn, bytesOut }) {
  return {
    styles,
    scripts,
    kept,
    files: files.size,
    bytes: bytesOnDisk(assetDir, files),
    bytesIn,
    bytesOut,
  };
}

/**
 * The ADR-0002 extracted-asset accounting: references from the log, the rest
 * from the files on disk. Shared by `project` and `--dedupe-tree`.
 * @param {string} assetDir
 * @param {string[]} names  The asset manifest (assets.json).
 * @param {number} references
 */
export function assetTotals(assetDir, names, references) {
  return { references, distinct: names.length, bytes: bytesOnDisk(assetDir, names) };
}

/**
 * Build-level summary (ticket 07): the whole-site counts and the route classes
 * the serving layer answers beside the mirrored tree.
 * @typedef {Object} BuildSummary
 * @property {string} captureRun  Capture run the build read, relative to the repo root.
 * @property {number} requested  Pages the caller listed, before dropping.
 * @property {number} served  Pages written (requested − dropped − errors).
 * @property {string[]} dropped  Scaffold/test pages dropped from serving (those the request listed).
 * @property {string[]} errors  Requested pages that failed to build (missing capture, …).
 * @property {{count: number, invalid: string[], dangling: string[]}} redirects  Legacy stubs → local targets, plus warnings.
 * @property {string[]} deadRoots  Dead collection roots (404, as the live site).
 * @property {string[]} authGated  Auth-gated stubs (not captured, not served).
 * @property {{mounted: number, absent: number}} chat  The chat-mount census over served pages (ticket 10): how many Captures mounted the launcher, how many did not.
 * @property {{references: number, distinct: number, bytes: number}} assets  Inlined data URIs extracted site-wide (ADR 0002): references rewritten, distinct files written, decoded bytes.
 * @property {{live: number, pages: number, srcdoc: number, element: number, component: number, frame: number, popover: number, dead: number, unreachable: number}} embeds  Live media embeds site-wide (ADR 0002): player frames made live, pages carrying at least one, the shape each replaced, slots kept as captured (popover, dead upstream), and the medias a page's JSON-LD named without a slot rewrite.
 * @property {number} originalUrls  `data-sf-original-*` attributes the build dropped from served bytes (ticket 12).
 * @property {{styles: number, scripts: number, kept: number, files: number, bytes: number, bytesIn: number, bytesOut: number}} bodies  Style/script bodies written as files site-wide (ADR 0003).
 */

/**
 * Project the per-page mutation log into the whole-site summary. This is the
 * one projection: `runPipeline` and the CLI both call it, and `--dedupe-tree`
 * reuses `bodyTotals`/`assetTotals` to update the same shape in a tree it did
 * not build.
 *
 * @param {Array<{page: string, error?: string}>} entries  The build's LogEntry[].
 * @param {{captureRun: string, requested: number, dropped: string[], redirects: {count: number, invalid: string[], dangling: string[]}, deadRoots: string[], authGated: string[], assetDir: string, assetNames: string[], bodyFiles: Set<string>}} run  The run-level facts the log cannot carry.
 * @param {SummaryGroup[]} [groups]  The metric table (overridable so a test can prove a new row flows through).
 * @returns {BuildSummary}
 */
export function project(entries, run, groups = SUMMARY_GROUPS) {
  const servedEntries = entries.filter((e) => !e.error);
  const projected = projectGroups(servedEntries, groups);
  const summary = {
    captureRun: run.captureRun,
    requested: run.requested,
    served: servedEntries.length,
    // the dropped pages among the requested list — the count identity is
    // served + dropped + errors === requested. (Pages the config drops that a
    // scoped subset build never requested are absent from the tree too; the
    // route check asserts every configured drop 404s.)
    dropped: run.dropped,
    errors: entries.filter((e) => e.error).map((e) => e.page),
    redirects: { count: run.redirects.count, invalid: run.redirects.invalid, dangling: run.redirects.dangling },
    deadRoots: run.deadRoots,
    authGated: run.authGated,
  };
  for (const [group, slice] of Object.entries(projected)) {
    // the two ADR groups mix log-folded numbers with the files on disk
    if (group === 'bodies') summary[group] = bodyTotals(run.assetDir, run.bodyFiles, slice);
    else if (group === 'assets') summary[group] = assetTotals(run.assetDir, run.assetNames, slice.references);
    else summary[group] = slice;
  }
  return summary;
}

/**
 * Render the summary as the CLI's lines (one console.log each). The per-page
 * log lines are the log's, not the summary's, and stay in build.mjs.
 * @param {BuildSummary} summary
 * @returns {string[]}
 */
export function render(summary) {
  const lines = [];
  lines.push(
    `build summary: ${summary.served} served + ${summary.dropped.length} dropped = ${summary.requested} requested`
    + (summary.errors.length > 0 ? ` (${summary.errors.length} error(s): ${summary.errors.join(', ')})` : '')
  );
  lines.push(
    `route classes: ${summary.redirects.count} redirect(s) → 301, ${summary.deadRoots.length} dead root(s) 404, `
    + `${summary.authGated.length} auth-gated 404`
  );
  lines.push(`chat census: ${summary.chat.mounted} page(s) mounted the launcher, ${summary.chat.absent} did not`);
  lines.push(
    `embeds: ${summary.embeds.live} live player frame(s) on ${summary.embeds.pages} page(s) `
    + `(${summary.embeds.srcdoc} srcdoc, ${summary.embeds.element} chrome incl. ${summary.embeds.popover} popover, `
    + `${summary.embeds.component} web component, ${summary.embeds.frame} re-pointed from the Capture's own URL) · `
    + `${summary.embeds.dead} dead-upstream kept as captured · `
    + `${summary.embeds.youtube} YouTube panel(s) armed on click · `
    + `${summary.embeds.vidzflow} hidden Vidzflow document(s) stripped · `
    + `${summary.embeds.unreachable} media(s) named in JSON-LD without a slot rewrite`
  );
  lines.push(
    `capture url bookkeeping: ${summary.originalUrls} data-sf-original-* attribute(s) dropped from served bytes`
  );
  lines.push(
    `assets: ${summary.assets.references} inlined reference(s) → ${summary.assets.distinct} content-addressed file(s), `
    + `${Math.round(summary.assets.bytes / 1e6)}MB decoded`
  );
  lines.push(
    `bodies: ${summary.bodies.styles} style + ${summary.bodies.scripts} script body(ies) → ${summary.bodies.files} file(s), `
    + `${Math.round(summary.bodies.bytes / 1e6)}MB (${summary.bodies.kept} kept inline); `
    + `html ${(summary.bodies.bytesIn / 1e6).toFixed(1)}MB → ${(summary.bodies.bytesOut / 1e6).toFixed(1)}MB`
  );
  for (const w of [...summary.redirects.invalid, ...summary.redirects.dangling]) lines.push(`⚠ redirect: ${w}`);
  return lines;
}
