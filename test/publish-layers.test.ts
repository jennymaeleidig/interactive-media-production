// The layer publisher's seams: the check's drift/address findings over a small
// fixture tree, the deliberate write it plans (a new content-addressed name,
// every carrying page rewritten, `assets.json` swapped, the orphan removed), and
// the idempotency that makes a second apply a no-op.
//
// The fixture is a served tree built from the real maintained sources, so the
// publisher is exercised against the same bytes the tree ships — the test never
// touches the committed `served/` tree.
//
// SPDX-License-Identifier: CC0-1.0
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYERS, elementEnd, markedMembers, markedTagText, markedTags } from '../pipeline/injected-layers.mjs';
import { applyPlan, contentAddressed, hash16, htmlFiles, insertAt, planLayers } from '../pipeline/publish-layers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SERVED = path.join(ROOT, 'served');
const FIXTURE_ROOT = path.join(ROOT, '.tmp/publish-layers-test');

let fixture: string | null = null;

type Tree = {
  servedDir: string;
  assetsDir: string;
  aHtml: string;
  bHtml: string;
  assets: string[];
  motionCssRef: string;
  navJsRef: string;
  scrollCssBody: string;
  productHtml?: string;
};

/** A CSS body that differs from the source in code, not comments. */
const drift = (source: string): string => `${source}\n.flock-publish-drift { display: none; }\n`;

/**
 * A served tree with two pages carrying the whole site roster, built from the
 * real maintained sources. `codeDrift` ships different bytes for motion/css and
 * the inline scroll/css; `nameDrift` ships nav/js under a name that is not its
 * own hash.
 */
function makeTree(options: { codeDrift?: boolean; nameDrift?: boolean; insertable?: 'present' | 'absent' } = {}): Tree {
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  fixture = fs.mkdtempSync(path.join(FIXTURE_ROOT, 'case-'));
  const servedDir = path.join(fixture, 'served');
  const assetsDir = path.join(servedDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const assets: string[] = [];
  const tags: string[] = [];
  let motionCssRef = '';
  let navJsRef = '';
  let scrollCssBody = '';

  for (const layer of LAYERS) {
    // the fixture pages carry the site-wide roster only; the page-scoped members
    // (legibility, and the six Lottie heroes) belong to pages this tree lacks
    if (layer.scope !== 'site') continue;
    for (const part of layer.parts) {
      if (part.patch || !part.source) continue; // page-scoped patches are not on these pages
      const source = fs.readFileSync(path.join(ROOT, part.source), 'utf8');
      if (part.delivery === 'asset') {
        const isCodeDrift = Boolean(options.codeDrift) && layer.name === 'motion' && part.kind === 'css';
        const isNameDrift = Boolean(options.nameDrift) && layer.name === 'nav' && part.kind === 'js';
        const bytes = isCodeDrift ? drift(source) : source;
        const ref = isNameDrift ? `deadbeefdeadbeef.${part.kind}` : `${hash16(bytes)}.${part.kind}`;
        fs.writeFileSync(path.join(assetsDir, ref), bytes);
        assets.push(ref);
        if (layer.name === 'motion' && part.kind === 'css') motionCssRef = ref;
        if (layer.name === 'nav' && part.kind === 'js') navJsRef = ref;
        tags.push(
          part.kind === 'css'
            ? `<link rel=stylesheet href=/assets/${ref} data-flock-parody="${layer.name}">`
            : `<script data-flock-parody="${layer.name}" src=/assets/${ref}></script>`,
        );
      } else {
        const body = Boolean(options.codeDrift) && layer.name === 'scroll' && part.kind === 'css' ? drift(source) : source;
        if (layer.name === 'scroll' && part.kind === 'css') scrollCssBody = body;
        tags.push(
          part.kind === 'css'
            ? `<style data-flock-parody="${layer.name}">${body}</style>`
            : `<script data-flock-parody="${layer.name}">${body}</script>`,
        );
      }
    }
  }

  const page = `<!doctype html>\n<html><head>\n${tags.join('\n')}\n</head><body><p>fixture</p></body></html>\n`;
  fs.writeFileSync(path.join(servedDir, 'a.html'), page);
  fs.writeFileSync(path.join(servedDir, 'b.html'), page);

  // A page in a page-scoped layer's scope, carrying the whole site roster and —
  // unless the case removes it — the `insert: true` member that layer declares.
  // The asset is written either way: a tag lost on its own leaves its asset
  // behind, which is the state an insertion has to repair from.
  let productHtml: string | undefined;
  if (options.insertable) {
    const layer = LAYERS.find((candidate) => candidate.name === 'lottie-flock-dfr');
    const source = layer?.parts[0].source;
    if (!source) throw new Error('the roster no longer declares the lottie-flock-dfr hero');
    const bytes = fs.readFileSync(path.join(ROOT, source), 'utf8');
    const ref = `${hash16(bytes)}.js`;
    fs.writeFileSync(path.join(assetsDir, ref), bytes);
    assets.push(ref);
    const tag = `<script data-flock-parody="lottie-flock-dfr" src=/assets/${ref}></script>`;
    const carried = options.insertable === 'present' ? `\n${tag}` : '';
    productHtml = path.join(servedDir, 'products/flock-dfr.html');
    fs.mkdirSync(path.dirname(productHtml), { recursive: true });
    fs.writeFileSync(productHtml, `<!doctype html>\n<html><head>\n${tags.join('\n')}${carried}\n</head><body><p>product</p></body></html>\n`);
  }

  fs.writeFileSync(path.join(servedDir, 'assets.json'), `${JSON.stringify([...assets].sort(), null, 2)}\n`);
  fs.writeFileSync(path.join(servedDir, 'build-summary.json'), `${JSON.stringify({ assets: { distinct: assets.length } }, null, 2)}\n`);

  return { servedDir, assetsDir, aHtml: path.join(servedDir, 'a.html'), bHtml: path.join(servedDir, 'b.html'), assets, motionCssRef, navJsRef, scrollCssBody, productHtml };
}

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const assets = (tree: Tree): string[] => JSON.parse(read(path.join(tree.servedDir, 'assets.json')));

/** Every file under `dir`, keyed by relative POSIX path, hashed. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const full = path.join(dir, rel);
    if (!fs.statSync(full).isFile()) continue;
    out[rel.split(path.sep).join('/')] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return out;
}

afterEach(() => {
  if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
  fixture = null;
});

describe('planLayers / applyPlan', () => {
  it('is green on a tree that ships the maintained bytes', () => {
    const tree = makeTree();
    const plan = planLayers({ servedDir: tree.servedDir, root: ROOT });
    expect(plan.summary).toEqual({ pages: 2, members: 22, assets: 20, inline: 2 });
    expect(plan.failures).toEqual([]);
    expect(plan.notes).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(htmlFiles(tree.servedDir)).toHaveLength(2);
  });

  it('fails the check on code drift, naming the member, and keeps it out of the blockers', () => {
    const tree = makeTree({ codeDrift: true });
    const plan = planLayers({ servedDir: tree.servedDir, root: ROOT });
    expect(plan.failures.some((failure) => failure.includes('code drift: motion/css'))).toBe(true);
    expect(plan.failures.some((failure) => failure.includes('code drift: scroll/css'))).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.changes).toHaveLength(2);
  });

  it('writes the content-addressed name, rewrites every carrying page, swaps assets.json, and deletes the old file', () => {
    const tree = makeTree({ codeDrift: true });
    const plan = planLayers({ servedDir: tree.servedDir, root: ROOT });
    const asset = plan.changes.find((change) => change.type === 'asset');
    const inline = plan.changes.find((change) => change.type === 'inline');
    if (!asset || asset.type !== 'asset') throw new Error('expected an asset change');
    if (!inline) throw new Error('expected an inline change');

    const source = read(path.join(ROOT, 'pipeline/motion.css'));
    const target = `${hash16(source)}.css`;
    expect(asset.to).toBe(target);
    expect(contentAddressed(target, source, 'css')).toBe(true);
    expect(contentAddressed(tree.motionCssRef, drift(source), 'css')).toBe(true);

    applyPlan(plan);

    // the new file carries the maintained bytes; the old name is gone
    expect(read(path.join(tree.assetsDir, target))).toBe(source);
    expect(fs.existsSync(path.join(tree.assetsDir, tree.motionCssRef))).toBe(false);

    // every carrying page names the new asset and no longer the old one
    for (const file of [tree.aHtml, tree.bHtml]) {
      expect(read(file)).toContain(`/assets/${target}`);
      expect(read(file)).not.toContain(`/assets/${tree.motionCssRef}`);
    }

    // the inline body was replaced with the maintained source
    const scroll = read(path.join(ROOT, 'pipeline/scroll.css'));
    expect(read(tree.aHtml)).toContain(`<style data-flock-parody="scroll">${scroll}</style>`);

    // assets.json swapped the old name for the new, sorted, at the same length
    const names = assets(tree);
    expect(names).toContain(target);
    expect(names).not.toContain(tree.motionCssRef);
    expect(names).toHaveLength(tree.assets.length);
    expect(names).toEqual([...names].sort());
    expect(read(path.join(tree.servedDir, 'assets.json')).endsWith(']\n')).toBe(true);
  });

  it('is idempotent — a second apply writes nothing', () => {
    const tree = makeTree({ codeDrift: true });
    applyPlan(planLayers({ servedDir: tree.servedDir, root: ROOT }));
    const before = snapshot(tree.servedDir);

    const second = planLayers({ servedDir: tree.servedDir, root: ROOT });
    expect(second.changes).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(applyPlan(second)).toEqual([]);

    expect(snapshot(tree.servedDir)).toEqual(before);
  });

  it('fails the check on an asset whose name does not address its own bytes, and renames it', () => {
    const tree = makeTree({ nameDrift: true });
    const plan = planLayers({ servedDir: tree.servedDir, root: ROOT });
    expect(plan.failures.some((failure) => failure.includes('unaddressed asset') && failure.includes('nav/js'))).toBe(true);
    expect(plan.changes).toHaveLength(1);

    applyPlan(plan);
    const target = `${hash16(read(path.join(ROOT, 'pipeline/nav-runtime.js')))}.js`;
    expect(fs.existsSync(path.join(tree.assetsDir, tree.navJsRef))).toBe(false);
    expect(read(path.join(tree.assetsDir, target))).toBe(read(path.join(ROOT, 'pipeline/nav-runtime.js')));
    expect(assets(tree)).toContain(target);
    expect(assets(tree)).not.toContain(tree.navJsRef);
    expect(planLayers({ servedDir: tree.servedDir, root: ROOT }).failures).toEqual([]);
  });
});

describe('a missing member the roster may create', () => {
  it('creates an `insert` member at the position the roster puts it, and is green afterwards', () => {
    const tree = makeTree({ insertable: 'absent' });
    const plan = planLayers({ servedDir: tree.servedDir, root: ROOT });

    // the one distinction that matters: a missing site-wide member is a blocker,
    // a missing `insert` member is work the write can do
    expect(plan.failures.some((failure) => failure.includes('missing member') && failure.includes('lottie-flock-dfr/js'))).toBe(true);
    expect(plan.blockers).toEqual([]);

    const change = plan.changes.find((candidate) => candidate.type === 'insert');
    if (!change || change.type !== 'insert') throw new Error('expected an insert change');
    const before = read(tree.productHtml!);
    const carried = markedTags(before);
    const anchor = elementEnd(before, carried[carried.length - 1]);
    // the tag goes on a line of its own, the way every marked member is laid out
    const tag = `\n<script data-flock-parody="lottie-flock-dfr" src=/assets/${change.ref}></script>`;
    expect(change.ref).toBe(`${hash16(read(path.join(ROOT, 'pipeline/lottie/flock-dfr.runtime.js')))}.js`);
    expect(change.targets).toEqual([{ file: tree.productHtml, page: '/products/flock-dfr', to: tag, at: anchor }]);

    applyPlan(plan);

    // the page is the original with exactly one tag spliced in after the last
    // member it carried that ships before this one
    expect(read(tree.productHtml!)).toBe(`${before.slice(0, anchor)}${tag}${before.slice(anchor)}`);

    // and the tree is green afterwards: the tag addresses its own bytes and the
    // asset it names was already there, so no record moved
    const after = planLayers({ servedDir: tree.servedDir, root: ROOT });
    expect(after.failures).toEqual([]);
    expect(after.changes).toEqual([]);
    expect(after.notes).toEqual([]);
    expect(assets(tree)).toHaveLength(tree.assets.length);
  });
});

describe('the hand-written Lottie tags the roster now owns', () => {
  // These tags were written into their pages by hand, before the roster could
  // declare them. These two tests are why `insert: true` may claim them: the tag
  // text the publisher would write is the text the pages carry, and the position
  // it would choose is the position they sit in.
  const HEROES = ['flock-dfr', 'flock-freeform', 'flock-os', 'flock-safety-platform', 'gunshot-detection', 'video-cameras'];

  it('reproduces each tag text exactly', () => {
    for (const name of HEROES) {
      const html = read(path.join(SERVED, 'products', `${name}.html`));
      const tag = markedTags(html).find((candidate) => candidate.name === `lottie-${name}`);
      expect(tag, name).toBeDefined();
      expect(markedTagText({ name: tag!.name, kind: tag!.kind, ref: tag!.ref }), name).toBe(html.slice(tag!.start, elementEnd(html, tag!)));
    }
  });

  it('chooses a position that puts each tag back byte-for-byte', () => {
    for (const name of HEROES) {
      const file = path.join(SERVED, 'products', `${name}.html`);
      const html = read(file);
      const tag = markedTags(html).find((candidate) => candidate.name === `lottie-${name}`)!;
      const entry = { file, rel: `products/${name}.html`, page: `/products/${name}`, html, members: markedMembers(html) };
      const at = insertAt(entry, `lottie-${name}`, 'js');
      expect(at, name).not.toBeNull();

      // the page with its Lottie line cut out, plus the tag the roster would
      // write at the position the anchor picks, is the page again — byte for byte
      const lineStart = html[tag.start - 1] === '\n' ? tag.start - 1 : tag.start;
      const without = `${html.slice(0, lineStart)}${html.slice(elementEnd(html, tag))}`;
      const text = `\n${markedTagText({ name: tag.name, kind: tag.kind, ref: tag.ref })}`;
      expect(`${without.slice(0, at!)}${text}${without.slice(at!)}`, name).toBe(html);
    }
  });
});

describe('the committed tree', () => {
  it('is green with only the prose drift the tree cannot rebuild away, as notes', () => {
    const plan = planLayers({ servedDir: SERVED, root: ROOT });
    expect(plan.failures).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.notes).toHaveLength(6);
    expect(plan.notes.every((note) => note.includes('prose drift'))).toBe(true);
    // the one test that walks the whole committed tree — 1,181 pages, 660 MB. It
    // measures ~15 s alone; under the full suite's parallel load it has been seen
    // past 37 s, so it carries a tree-scan budget rather than the default a
    // fixture-sized test gets.
  }, 60_000);
});
