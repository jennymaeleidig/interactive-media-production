// The capture pointer: which capture run the build serves from.
// One value — moving the Recreation to a fresh capture run is this one switch.
// Relative to the repo root; overrides: `npm run pipeline -- --run <dir>`.
//
// `2026-09-11` is the corrected-flags run (ticket 15): it was captured with
// `--remove-hidden-elements=false --remove-unused-styles=false`, so it keeps
// the hidden subtrees (closed menus, take-overs, modal panels) and the state
// CSS (open/active rules that matched no element at capture time) that the
// 2026-09-09 defaults dropped. The refresh runbook (ticket 11) records the
// corrected flags as the default for every future run.
export const CAPTURE_RUN = '.scratch/flock-parody/research/flocksafety/2026-09-11';

// Scaffold/test pages: captured 200 pages that are internal Webflow test
// scaffolding, not site content, and are dropped from serving entirely
// (spec, "Serving and links"). The Recreation serves the live inventory minus
// this list; every dropped path 404s.
//
// The list is explicit (not a runtime heuristic) so it is auditable and a
// stale entry fails the build loudly. Membership rule: the page's slug marks
// it as a test scaffold, AND no other served page links to it (verified
// corpus-wide: dropping these introduces no Recreation-introduced dead link).
// Real content pages whose slugs merely contain a suggestive word are NOT
// here — e.g. /business-template ("Business Funding Letter Template", a gated
// resource), /book-a-demo-layout ("Ready When You Are"), /fb-click-id and
// /privacy-ethics-copy all carry real captured body content and stay served.
export const DROPPED_PAGES = [
  '/book-a-demo-form-test',
  '/book-a-demo-short-form-test',
  '/book-a-demo-test',
  '/email-exclusions-test',
  '/form-test',
  '/webinar/this-is-a-test',
  '/webinar/webinar-test-evens-page',
  '/webinar/webinar-test-evens-page-copy',
  '/webinar/webinar-test-evens-page-copy-2',
  '/webinar/webinar-test-evens-page-copy-3',
  '/webinar/webinar-test-evens-page-copy-4',
  '/webinar/webinar-test-evens-page-copy-5',
  '/webinar/webinar-test-evens-page-copy-6',
  '/webinar/webinar-test-evens-page-copy-7',
  '/webinar/webinar-test-evens-page-copy-8',
  '/webinar/webinar-test-evens-page-copy-9',
  '/webinar/webinar-test-evens-page-copy-10',
  '/webinar/webinar-test-evens-page-copy-11',
  '/webinar/webinar-test-evens-page-past',
];
