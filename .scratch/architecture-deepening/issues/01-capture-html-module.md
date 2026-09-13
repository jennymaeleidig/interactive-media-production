# 01 — One module owns the capture-HTML source text

Status: resolved
Blocked by: none

## What to build

Review candidate 1. Three modules each own their own "find the tags, skip the
quoted values" rules and disagree: `pipeline/build.mjs:452–536` (`openTagRe`,
`SKIP_ZONE`, `mapContentSegments`, `attrValue`, `hasAttr`, `editAttr`,
`withAddedAttr`), `pipeline/embeds.mjs:100–167, 413–434` (`openTags`, `attrOf`,
`srcdocSpans`), `pipeline/dedupe.mjs:70–160` (`cspMeta`, `rawAttr`, `attrValue`,
`tagEnd`, `scanBodies`).

Create `pipeline/html.mjs`: one internal tokenizer, and the views the callers
need. The tokenizer is not exported; the views are. Views stay explicit where
the dialects genuinely differ — build edits *inside* SVG (`#main-progress` is an
SVG path), `scanBodies` must skip SVG subtrees and comments. The view names and
their dialect facts are the interface.

## Acceptance criteria

- [x] `pipeline/html.mjs` owns the tokenizer; no caller re-derives quoting,
      comment, srcdoc, or SVG rules.
- [x] `attrValue(attrs, name)` has one meaning repo-wide; dedupe's
      `attrValue(value)` (unquoting) is renamed.
- [x] `scanBodies` and `srcdocSpans` move behind the new module; `dedupe.mjs` and
      `embeds.mjs` import them instead of exporting their own.
- [x] Both ticket-12 failure modes are covered by tests at the new interface: a
      multi-MB unquoted attribute value, and a nested `srcdoc` document whose
      stylesheets must not be rewritten.
- [x] Fixture output byte-identical (`.tmp/golden` diff empty).
- [x] `CODING_STANDARDS.md` stack/layout list names the new pure core.

## Comments

Resolved as a structure-only move: **the dialects were kept, not merged.** The
investment a merge needs is not available — the Captures are gone (ADR 0004), so
a changed dialect cannot be re-validated against the bytes the frozen tree was
built from, and the fixture diff only proves equivalence on the fixture.

Two differences were probed against the frozen tree and turned out to be
load-bearing, which is why `attrValue` (loose `\b`) and `attrOf` (guarded
`(?<![\w-])`) both survive:

- `data-style=bottomright style="…"` on one tag, 145 times across the frozen
  tree (Google's reCAPTCHA badge). The loose rule reads `data-style` as `style`.

Evidence: `.tmp/golden` diff empty (24-file tree, byte for byte, plus an
identical mutation log); full suite 320 tests green in 16 files.
