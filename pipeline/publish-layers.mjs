// Publish the Recreation's marked layers into the committed `served/` tree.
//
// `injected-layers.mjs` owns the one comparison that says whether the bytes a
// page ships still match the source we maintain, and it deliberately stops
// there: rewriting a marked layer — new bytes, a new content-addressed name,
// every carrying page rewritten, `assets.json` regenerated and the orphaned
// asset deleted — is a rare deliberate write, so it was deferred until a layer
// actually changed. This module is that write, made repeatable.
//
// What it reads is never assumed: the asset name is a hash of the bytes, so it
// is read from the page, not remembered, and the pages are enumerated from the
// tree rather than from a roster. What it writes is content-addressed: the
// maintained source goes to `served/assets/<sha256_16(bytes)>.<kind>`, every
// carrying page's reference is rewritten to that name, `served/assets.json` is
// updated in place (the exact two-space form and its trailing newline), and the
// old file is removed once no page names it. Inline members get the same
// treatment with the bytes swapped into the marked tag's body instead of a file.
//
// The write is idempotent by construction: `--check` is the same plan without
// the writes, and the plan only ever schedules a change for a member whose code
// has drifted or whose name does not address its own bytes. Prose-only drift is
// reported and never rewritten — the tree cannot be rebuilt from `pipeline/`, so
// a comment difference is a note, not a reason to rewrite 1,181 pages.
//
// The planning core reads the tree and returns what it would do; the CLI is the
// thin shell around `planLayers` and `applyPlan`. `--check` is the read-only CI
// guard (`npm run check:layers`), `--apply` the deliberate write.
//
// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokedDirectly, makeArg } from './cli.mjs';
import { maintainedSource, markedMembers, mirrorFindings, partOf, shippedSource } from './injected-layers.mjs';
import { MARKER_ATTR } from './marker.mjs';
import { routeOfPage } from './served-tree.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** Hex characters a content-addressed asset name carries. */
const HASH_CHARS = 16;

/**
 * A marked member as `markedMembers` reports it: `ref` for an `/assets/<name>`
 * reference, `body` for bytes written into the tag.
 * @typedef {{ name: string, kind: 'css'|'js', delivery: 'asset'|'inline', ref?: string, body?: string }} Marked
 */

/**
 * One served page and the marked members it carries, in the order it carries
 * them.
 * @typedef {{ file: string, rel: string, page: string, html: string, members: Marked[] }} PageEntry
 */

/**
 * One asset member the plan would republish: the name the pages carry, the
 * content-addressed name the maintained bytes earn, why it moved, and every page
 * that must be rewritten.
 * @typedef {{ type: 'asset', name: string, kind: 'css'|'js', from: string, to: string, bytes: string, origin: string, reason: string, pages: string[] }} AssetChange
 */

/**
 * One inline member the plan would republish, as one body swap per carrying
 * page (a page-scoped patch keeps its own bytes, so the target is per page).
 * @typedef {{ type: 'inline', name: string, kind: 'css'|'js', origin: string, reason: string, targets: { file: string, page: string, to: string }[] }} InlineChange
 */

/** @typedef {AssetChange | InlineChange} Change */

/**
 * A failure or note plus the page it happened on, kept structured until the
 * report collapses the 1,181 instances of a site-wide drift into one line.
 * @typedef {{ text: string, page: string, fixable: boolean }} Finding
 */

/**
 * The whole publish decision for one served tree.
 * @typedef {{
 *   servedDir: string,
 *   root: string,
 *   pages: PageEntry[],
 *   changes: Change[],
 *   failures: string[],
 *   notes: string[],
 *   blockers: string[],
 *   summary: { pages: number, members: number, assets: number, inline: number },
 *   assets: { names: string[], distinct: number },
 * }} LayerPlan
 */

/** The 16-hex content address of a member's bytes, the name's only variable half. */
/**
 * @param {string | Buffer} bytes
 * @returns {string}
 */
export function hash16(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_CHARS);
}

/**
 * Whether a page's reference is the content-addressed name its own bytes earn.
 * @param {string} ref
 * @param {string | Buffer} bytes
 * @param {string} kind
 * @returns {boolean}
 */
export function contentAddressed(ref, bytes, kind) {
  return ref === `${hash16(bytes)}.${kind}`;
}

/**
 * Every `*.html` file under `servedDir`, absolute and in a deterministic
 * (directory, then name) order — the enumeration the plan and the apply share,
 * so they cannot disagree about which pages exist.
 * @param {string} servedDir
 * @returns {string[]}
 */
export function htmlFiles(servedDir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    const items = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.endsWith('.html')) out.push(full);
    }
  };
  walk(path.resolve(servedDir));
  return out;
}

/**
 * Comment-and-whitespace-folded source — the same comparator the roster's
 * comparison uses (it arrived with the DOM seams). It is restated here, once,
 * because the publisher must *name* the member it will rewrite, not merely learn
 * from `mirrorFindings` that some page drifts.
 * @param {string} source
 * @returns {string}
 */
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether two byte strings are the same code. Prose-only differences are `true`.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const sameCode = (a, b) => codeOf(a) === codeOf(b);

/**
 * The maintained source reader, memoized by member and page — the plan asks the
 * same question once per page and once per change, and a page-scoped patch is
 * the only member whose answer is page-dependent.
 * @param {string} root
 * @returns {(name: string, kind: string, page: string) => { bytes: string, origin: string } | null}
 */
function maintainedReader(root) {
  /** @type {Map<string, { bytes: string, origin: string } | null>} */
  const cache = new Map();
  return (name, kind, page) => {
    const key = `${name}/${kind}/${page}`;
    if (!cache.has(key)) cache.set(key, maintainedSource(name, kind, page, root));
    return cache.get(key) ?? null;
  };
}

/**
 * The shipped-bytes reader, memoized by reference: a site-wide asset is named by
 * every page and must be read once.
 * @param {string} servedDir
 * @returns {(ref: string) => string | null}
 */
function shippedReader(servedDir) {
  /** @type {Map<string, string | null>} */
  const cache = new Map();
  return (ref) => {
    if (!cache.has(ref)) cache.set(ref, shippedSource(servedDir, ref));
    return cache.get(ref) ?? null;
  };
}

/**
 * Collapse the same finding repeated page after page into one line: the page is
 * normalized to `*` and the count of pages is appended. One drifting site-wide
 * member becomes one line, not 1,181.
 * @param {Finding[]} findings
 * @returns {string[]}
 */
function tally(findings) {
  /** @type {Map<string, { count: number, text: string }>} */
  const groups = new Map();
  for (const finding of findings) {
    const shape = finding.page ? stripPage(finding.text, finding.page) : finding.text;
    const group = groups.get(shape);
    if (group) group.count++;
    else groups.set(shape, { count: 1, text: finding.text });
  }
  return [...groups.entries()].map(([shape, { count, text }]) => (count > 1 ? `${shape} (${count} pages)` : text));
}

/**
 * Remove one page path from a finding's text, matched as a whole token so a
 * route like `/` cannot eat the slash in `interactions/css`.
 * @param {string} text
 * @param {string} page
 * @returns {string}
 */
function stripPage(text, page) {
  const escaped = page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[\\s:])${escaped}(?=[\\s:]|$)`).exec(text);
  if (!match) return text;
  const at = match.index + match[1].length;
  return `${text.slice(0, at)}*${text.slice(at + page.length)}`;
}

/**
 * Plan the publish: every page, every marked member, the changes the maintained
 * sources demand, and the check's failures and notes. Read-only.
 * @param {{ servedDir: string, root?: string }} input
 * @returns {LayerPlan}
 */
export function planLayers({ servedDir, root = '.' }) {
  const served = path.resolve(servedDir);
  const maintained = maintainedReader(root);
  const shipped = shippedReader(served);
  /** @type {PageEntry[]} */
  const pages = [];
  /** @type {Finding[]} */
  const rawFailures = [];
  /** @type {Finding[]} */
  const rawNotes = [];

  for (const file of htmlFiles(served)) {
    const html = readFileSync(file, 'utf8');
    const rel = path.relative(served, file).split(path.sep).join('/');
    const page = routeOfPage(rel) ?? `/${rel}`;
    const members = markedMembers(html);
    pages.push({ file, rel, page, html, members });
    const findings = mirrorFindings({
      page,
      members,
      shipped: (member) => (member.ref ? shipped(member.ref) : member.body ?? null),
      maintained: (name, kind, pg) => maintained(name, kind, pg),
    });
    for (const text of findings.failures) {
      // a missing asset is re-reported below by name and reference; the roster's
      // own 'unreadable' line would say the same thing less precisely
      if (text.startsWith('unreadable:')) continue;
      // a byte-level code difference is exactly what this module rewrites; every
      // other failure (a missing member, an undeclared one, a wrong delivery
      // form, no source at all) is a blocker the write must refuse on
      rawFailures.push({ text, page, fixable: text.startsWith('code drift:') });
    }
    for (const text of findings.notes) rawNotes.push({ text, page, fixable: false });
  }

  /** @type {Map<string, { name: string, kind: 'css'|'js', refs: Set<string>, reasons: Set<string>, bytes: string, origin: string, pages: Set<string>, missing: boolean }>} */
  const assetGroups = new Map();
  /** @type {Map<string, { name: string, kind: 'css'|'js', origin: string, targets: { file: string, page: string, to: string }[] }>} */
  const inlineGroups = new Map();

  for (const entry of pages) {
    for (const member of entry.members) {
      const part = partOf(member.name, member.kind);
      const key = `${member.name}/${member.kind}`;
      // the roster owns what a page must carry; a mismatch is a blocker
      // `mirrorFindings` already named, so the plan publishes nothing for it
      if (!part || part.delivery !== member.delivery) continue;
      const source = maintained(member.name, member.kind, entry.page);
      if (!source) continue;

      if (member.delivery === 'asset') {
        const ref = member.ref ?? '';
        const bytes = shipped(ref);
        let reason = null;
        if (bytes === null) {
          rawFailures.push({
            text: `missing asset: ${entry.page} names ${key} at served/assets/${ref}, which the tree does not carry`,
            page: entry.page,
            fixable: true,
          });
          reason = 'missing';
        } else if (!sameCode(bytes, source.bytes)) {
          reason = 'code drift';
        } else if (!contentAddressed(ref, bytes, member.kind)) {
          rawFailures.push({
            text: `unaddressed asset: ${entry.page} names ${key} as ${ref}, whose name is not sha256_16 of its own bytes`,
            page: entry.page,
            fixable: true,
          });
          reason = 'name drift';
        }
        const group = assetGroups.get(key) ?? {
          name: member.name,
          kind: member.kind,
          refs: new Set(),
          reasons: new Set(),
          bytes: source.bytes,
          origin: source.origin,
          pages: new Set(),
          missing: false,
        };
        group.refs.add(ref);
        group.pages.add(entry.rel);
        if (reason) group.reasons.add(reason);
        assetGroups.set(key, group);
      } else {
        const body = member.body ?? '';
        if (!sameCode(body, source.bytes)) {
          const group = inlineGroups.get(key) ?? { name: member.name, kind: member.kind, origin: source.origin, targets: [] };
          group.targets.push({ file: entry.file, page: entry.page, to: source.bytes });
          inlineGroups.set(key, group);
        }
      }
    }
  }

  /** @type {Change[]} */
  const changes = [];
  for (const [key, group] of assetGroups) {
    if (group.refs.size > 1) {
      rawFailures.push({
        text: `name disagreement: ${key} is shipped as ${[...group.refs].join(' and ')} across the pages that carry it`,
        page: '',
        fixable: false,
      });
      continue;
    }
    if (group.reasons.size === 0) continue;
    changes.push({
      type: 'asset',
      name: group.name,
      kind: group.kind,
      from: [...group.refs][0] ?? '',
      to: `${hash16(group.bytes)}.${group.kind}`,
      bytes: group.bytes,
      origin: group.origin,
      reason: [...group.reasons].join(', '),
      pages: [...group.pages],
    });
  }
  for (const group of inlineGroups.values()) {
    changes.push({ type: 'inline', name: group.name, kind: group.kind, origin: group.origin, reason: 'code drift', targets: group.targets });
  }
  changes.sort((a, b) => (a.name === b.name ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name)));

  const members = pages.reduce((total, entry) => total + entry.members.length, 0);
  const assets = pages.reduce((total, entry) => total + entry.members.filter((member) => member.delivery === 'asset').length, 0);

  return {
    servedDir: served,
    root,
    pages,
    changes,
    failures: tally(rawFailures),
    notes: tally(rawNotes),
    blockers: tally(rawFailures.filter((finding) => !finding.fixable)),
    summary: { pages: pages.length, members, assets, inline: members - assets },
    assets: { names: readAssets(served), distinct: readDistinct(served) },
  };
}

/**
 * A refused publish, carrying the failures that refused it.
 */
export class PublishLayersError extends Error {
  /** @param {string[]} failures */
  constructor(failures) {
    super(`publish layers refused:\n  ${failures.join('\n  ')}`);
    this.name = 'PublishLayersError';
    /** @type {string[]} */
    this.failures = failures;
  }
}

/**
 * The `served/assets.json` list, or an empty one when the build wrote none.
 * @param {string} servedDir
 * @returns {string[]}
 */
function readAssets(servedDir) {
  try {
    return JSON.parse(readFileSync(path.join(servedDir, 'assets.json'), 'utf8'));
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * The distinct-asset count the build's own summary records — the number
 * `regression/routes.mjs` keeps `assets.json` equal to, and the number the
 * publish keeps equal in turn.
 * @param {string} servedDir
 * @returns {number}
 */
function readDistinct(servedDir) {
  try {
    const summary = JSON.parse(readFileSync(path.join(servedDir, 'build-summary.json'), 'utf8'));
    return summary.assets?.distinct ?? 0;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return 0;
    throw err;
  }
}

/**
 * The `<link>`, `<script>` or `<style>` tag a page carries for one member, as a
 * half-open `[start, end)` span. Located by the roster's marker and the element
 * the delivery form implies, which is the same tag `markedMembers` read. `null`
 * when the page does not carry it.
 * @param {string} html
 * @param {string} name
 * @param {string} kind
 * @param {'asset'|'inline'} delivery
 * @returns {{ start: number, end: number } | null}
 */
function tagSpan(html, name, kind, delivery) {
  const element = kind === 'js' ? 'script' : delivery === 'inline' ? 'style' : 'link';
  const marker = `${MARKER_ATTR}="${name}"`;
  let from = 0;
  for (;;) {
    const at = html.indexOf(marker, from);
    if (at === -1) return null;
    const start = html.lastIndexOf('<', at);
    const end = html.indexOf('>', at);
    if (start === -1 || end === -1) return null;
    const word = /^<\s*([a-z0-9]+)/i.exec(html.slice(start, at));
    if (word && word[1].toLowerCase() === element) return { start, end: end + 1 };
    from = at + marker.length;
  }
}

/**
 * The page with one asset reference renamed inside its marked tag.
 * @param {string} html
 * @param {AssetChange} change
 * @returns {string}
 */
function rewriteAssetRef(html, change) {
  const span = tagSpan(html, change.name, change.kind, 'asset');
  if (!span) throw new PublishLayersError([`cannot find the marked ${change.name}/${change.kind} tag to rewrite`]);
  const tag = html.slice(span.start, span.end).split(change.from).join(change.to);
  return `${html.slice(0, span.start)}${tag}${html.slice(span.end)}`;
}

/**
 * The page with one inline member's body replaced, the close tag kept.
 * @param {string} html
 * @param {InlineChange} change
 * @param {string} to
 * @returns {string}
 */
function rewriteInlineBody(html, change, to) {
  const span = tagSpan(html, change.name, change.kind, 'inline');
  if (!span) throw new PublishLayersError([`cannot find the marked ${change.name}/${change.kind} tag to rewrite`]);
  const close = `</${change.kind === 'js' ? 'script' : 'style'}>`;
  const bodyEnd = html.indexOf(close, span.end);
  if (bodyEnd === -1) throw new PublishLayersError([`cannot find the closing tag of ${change.name}/${change.kind}`]);
  return `${html.slice(0, span.end)}${to}${html.slice(bodyEnd)}`;
}

/**
 * Apply a plan to the served tree. Every write is scheduled and validated before
 * the first byte lands — an unfixable failure, or an `assets.json` edit that
 * would break the count it shares with the build summary, refuses the whole run.
 * Idempotent: a tree that already ships the maintained bytes plans no changes,
 * so a second apply writes nothing.
 * @param {LayerPlan} plan
 * @returns {Change[]} the changes that were written
 */
export function applyPlan(plan) {
  if (plan.blockers.length > 0) throw new PublishLayersError(plan.blockers);

  const { servedDir } = plan;
  const current = plan.assets.names;
  const removed = new Set();
  const added = new Set();
  for (const change of plan.changes) {
    if (change.type !== 'asset' || change.from === change.to) continue;
    removed.add(change.from);
    added.add(change.to);
  }
  const next = [...new Set(current.filter((name) => !removed.has(name)).concat([...added]))].sort();
  if (next.length !== plan.assets.distinct) {
    throw new PublishLayersError([
      `assets.json would list ${next.length} file(s) but the summary says ${plan.assets.distinct} — the publish refuses to leave the tree's own two records disagreeing`,
    ]);
  }

  /** @type {Map<string, string>} */
  const pageEdits = new Map();
  for (const change of plan.changes) {
    if (change.type === 'asset') {
      for (const rel of change.pages) {
        const entry = plan.pages.find((page) => page.rel === rel);
        if (!entry) throw new PublishLayersError([`planned page served/${rel} is not in the tree`]);
        pageEdits.set(entry.file, rewriteAssetRef(pageEdits.get(entry.file) ?? entry.html, change));
      }
    } else {
      for (const target of change.targets) {
        const entry = plan.pages.find((page) => page.file === target.file);
        if (!entry) throw new PublishLayersError([`planned page ${target.page} is not in the tree`]);
        pageEdits.set(target.file, rewriteInlineBody(pageEdits.get(target.file) ?? entry.html, change, target.to));
      }
    }
  }

  // prove the rewrite landed before anything is written
  for (const change of plan.changes) {
    const files = change.type === 'asset' ? change.pages.map((rel) => plan.pages.find((page) => page.rel === rel)?.file) : change.targets.map((target) => target.file);
    for (const file of files) {
      const html = pageEdits.get(file ?? '');
      if (html === undefined) continue;
      const member = markedMembers(html).find((m) => m.name === change.name && m.kind === change.kind);
      const landed = member && (change.type === 'asset' ? member.ref === change.to : change.targets.some((target) => target.file === file && member.body === target.to));
      if (!landed) throw new PublishLayersError([`the ${change.name}/${change.kind} rewrite did not land in ${path.relative(servedDir, file ?? '')}`]);
    }
  }

  for (const change of plan.changes) {
    if (change.type !== 'asset') continue;
    writeFileSync(path.join(servedDir, 'assets', change.to), change.bytes, 'utf8');
  }
  for (const [file, html] of pageEdits) writeFileSync(file, html, 'utf8');
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    writeFileSync(path.join(servedDir, 'assets.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  // an old asset file is orphaned once no page names it any more
  const remaining = plan.pages.map((entry) => pageEdits.get(entry.file) ?? entry.html);
  for (const name of removed) {
    if (remaining.some((html) => html.includes(`/assets/${name}`))) continue;
    rmSync(path.join(servedDir, 'assets', name), { force: true });
  }

  return plan.changes;
}

/**
 * One change as a log line. Inline bodies are not printed — the interesting fact
 * is which member moved and how far, not the kilobytes it moved.
 * @param {Change} change
 * @returns {string}
 */
function changeLine(change) {
  if (change.type === 'asset') {
    return `${change.name}/${change.kind}: served/assets/${change.from} → served/assets/${change.to} (${change.reason}) — ${change.pages.length} page(s)`;
  }
  return `${change.name}/${change.kind}: inline body from ${change.origin} (${change.reason}) — ${change.targets.length} page(s)`;
}

/**
 * The report the CLI prints, shaped like the serving check's: what was scanned,
 * the notes that are expected, then the failures that are not.
 * @param {LayerPlan} plan
 * @param {{ servedDir: string, mode: 'check'|'apply', changes: Change[] }} input
 */
function report(plan, { servedDir, mode, changes }) {
  const rel = path.relative(ROOT, path.resolve(servedDir)) || '.';
  console.log(`Publish layers (${mode}) — ${rel}/`);
  console.log(`  ${plan.summary.pages} page(s), ${plan.summary.members} marked member(s): ${plan.summary.assets} asset, ${plan.summary.inline} inline`);
  if (mode === 'apply') {
    if (changes.length === 0) console.log('  0 change(s) — the tree already ships the maintained bytes');
    for (const change of changes) console.log(`  ✓ ${changeLine(change)}`);
  }
  if (plan.notes.length > 0) {
    console.log(`\n• ${plan.notes.length} note(s) — expected, not failures:`);
    for (const note of plan.notes) console.log(`  ${note}`);
  }
  if (plan.failures.length > 0) {
    console.log(`\n✗ ${plan.failures.length} failure(s):`);
    for (const failure of plan.failures) console.log(`  ${failure}`);
  } else {
    console.log('\n✓ Injected layers green: every marked member is content-addressed and ships the maintained code.');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = makeArg(argv);
  const servedDir = path.resolve(ROOT, arg('--served') ?? 'served');
  const apply = argv.includes('--apply');
  if (apply && argv.includes('--check')) throw new Error('pass at most one of --check and --apply');

  const before = planLayers({ servedDir, root: ROOT });
  if (apply) applyPlan(before);
  const after = apply ? planLayers({ servedDir, root: ROOT }) : before;
  report(after, { servedDir, mode: apply ? 'apply' : 'check', changes: before.changes });
  if (after.failures.length > 0) process.exitCode = 1;
}

if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof PublishLayersError) {
      console.error(`✗ ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  });
}
