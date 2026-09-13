// The build's pass sequence, in execution order, with the preconditions that
// make the order load-bearing.
//
// The order used to be carried by position in `runPipeline` plus prose in
// comments, numbered three different ways: the file header's pass list, the
// section banners (`pass 13` sat before `10`, `10b`, `11`, `14`; `legibility`
// had no banner; the header still documented a retired pass 2), and the
// `(ticket NN)` tags on each function. Nothing could check any of them, so the
// numbering drifted. Now the sequence is one table: `n` is the only number a
// pass has, `summary` is its one-line job, and `after` / `before` name the
// ordering rules that are not just "the previous line" — with `why` so the
// reason travels with the constraint. `test/passes.test.ts` asserts the shape
// (unique sequential numbers, named neighbours, the load-bearing order).
//
// The build keeps the implementations (`PASS_IMPL` in build.mjs, keyed by
// `name`) because each pass needs the build's own helpers and per-page state;
// this module owns only what the sequence *is*.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * @typedef {object} PassConstraint
 * @property {string} name  a pass that must run *after* this one
 * @property {string} why   the reason the order matters
 *
 * @typedef {object} PassSpec
 * @property {number} n      the pass's position, unique and sequential
 * @property {string} name   key into the build's `PASS_IMPL` table
 * @property {string} summary one line: what the pass does
 * @property {string|null} after   the pass that must run immediately before, or null for the first
 * @property {PassConstraint[]} before  passes that must run later, with the reason
 */

/** @type {PassSpec[]} */
export const PASSES = [
  {
    n: 1,
    name: 'strip',
    summary: 'remove the third-party machinery from the captured DOM (Qualified, OneTrust)',
    after: null,
    before: [],
  },
  {
    n: 2,
    name: 'rewrite',
    summary: 'internal hrefs https://(www.)flocksafety.com/X → /X; external links stay live',
    after: 'strip',
    before: [],
  },
  {
    n: 3,
    name: 'forms',
    summary: 'point each captured lead form at the local mock API route (per-form key)',
    after: 'rewrite',
    before: [],
  },
  {
    n: 4,
    name: 'embeds',
    summary: 'swap each inert video snapshot for the live player document (ADR 0002)',
    after: 'forms',
    before: [{ name: 'assets', why: 'the snapshots it discards carry inlined data: URIs of their own' }],
  },
  {
    n: 5,
    name: 'originalUrls',
    summary: "drop the Capture's data-sf-original-* bookkeeping the embed pass consumed",
    after: 'embeds',
    before: [],
  },
  {
    n: 6,
    name: 'assets',
    summary: 'extract every inlined data: URI asset to /assets/<sha16>.<ext> (ADR 0002)',
    after: 'originalUrls',
    before: [{ name: 'motion', why: 'the injected runtimes ship verbatim, so their bytes must not be rewritten' }],
  },
  {
    n: 7,
    name: 'motion',
    summary: 'normalize captured reveal from-states, annotate split words, inject the motion layer',
    after: 'assets',
    before: [],
  },
  {
    n: 8,
    name: 'interactions',
    summary: 'inject the delegated interaction runtime + suppress-only CSS',
    after: 'motion',
    before: [],
  },
  {
    n: 9,
    name: 'nav',
    summary: "inject the shared header's behavior runtime + CSS",
    after: 'interactions',
    before: [],
  },
  {
    n: 10,
    name: 'chat',
    summary: 'mount the Chat mimic + connect-src grant on the captured-launcher pages',
    after: 'nav',
    before: [],
  },
  {
    n: 11,
    name: 'storyHook',
    summary: 'inject the dormant flockParody DOM-patching seam inline, verbatim',
    after: 'chat',
    before: [],
  },
  {
    n: 12,
    name: 'legibility',
    summary: 'inject the page-scoped legibility CSS patch, when the page has one',
    after: 'storyHook',
    before: [],
  },
  {
    n: 13,
    name: 'scroll',
    summary: 'normalize captured scroll from-states, inject the scroll layer',
    after: 'legibility',
    before: [],
  },
  {
    n: 14,
    name: 'write',
    summary: 'restore </body></html> on captures truncated before the closing tags',
    after: 'scroll',
    before: [{ name: 'dedupe', why: 'the restored close must exist before the final body scan' }],
  },
  {
    n: 15,
    name: 'dedupe',
    summary: 'ship each style/script body over KEEP_INLINE_BYTES once, as an /assets file (ADR 0003)',
    after: 'write',
    before: [],
  },
];

/** The pass names, in order. */
export const PASS_NAMES = PASSES.map((pass) => pass.name);

/**
 * The pass with `name`, or a throw naming the unknown pass.
 * @param {string} name
 * @returns {PassSpec}
 */
export function passNamed(name) {
  const pass = PASSES.find((p) => p.name === name);
  if (pass === undefined) throw new Error(`unknown pass: ${name}`);
  return pass;
}
