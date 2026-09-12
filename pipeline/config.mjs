// The capture pointer: which capture run the build serves from.
// One value — moving the Recreation to a fresh capture run is this one switch.
// Relative to the repo root; overrides: `npm run pipeline -- --run <dir>`.
//
// `2026-09-12` is the signed-off run (ticket 12, the final fidelity gate): a
// full re-capture of the live site through the ticket-11 driver, 1,200/1,200
// pages saved, 0 failed, with the ticket-15 corrected flags
// (`--remove-hidden-elements=false --remove-unused-styles=false`) so the hidden
// subtrees and state CSS survive. It is the run the phase-gate signoff covers;
// the refresh runbook (ticket 11) records the corrected flags as the default
// for every future run.
export const CAPTURE_RUN = '.scratch/flock-parody/research/flocksafety/2026-09-12';

// Wistia medias that are gone upstream, so there is nothing to mimic: Wistia
// answers their media JSON with `{"error":true}` (deleted or made private in
// the account), which means the embed is broken on the live site too. The embed
// pass (ADR 0002) leaves these slots in their captured end-state instead of
// pointing a player at a media that cannot play. Source of truth:
// `.scratch/flock-parody-impl/video-inventory/2026-09-11/playability.csv`, which
// `node pipeline/video-probe.mjs --inv <that dir>` regenerates.
// A stale entry fails loudly: the pass logs `dead` slots and the audit counts
// every off-allow-list fetch, so an id that came back to life shows up as an
// inert slot rather than silently drifting.
// The list is only as complete as the inventory's slot detection, and that
// detection reads URLs. When the embed pass first turned an attribute-form slot
// (`<wistia-player media-id=tthkbjay3c>`) into a live embed URL, the inventory saw
// that media for the first time, the probe found it dead, and this list was one
// entry short — the build had already made that slot live. Ticket 17 carries the
// root fix (detect the attribute forms the inventory cannot see).
export const DEAD_VIDEO_IDS = ['77o31nkq0o', 'gayegdwaii', 'imr6vzeawt', 'ueo7k59ryn', 'tthkbjay3c'];

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
