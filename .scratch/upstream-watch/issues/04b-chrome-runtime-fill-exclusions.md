# 04b — Chrome-tier runtime-fill exclusions

Status: resolved
Blocked by: 04

## What to build

A steady-state live run must produce an empty chrome report (spec user story 5:
"a steady-state run to produce an empty report, so that a non-empty report is an
alarm I will actually read"; decision 5: the split "is what makes a steady-state
report empty"). Ticket 04's chrome tier is not empty. A plain live run on
2026-09-13 (`node regression/upstream-watch-cli.mjs --json`, exit 1) reported
**1,181 chrome comparisons, 170 differed** — the tier is the
"permanently non-empty, useless as an alarm" failure its own header names.

The 170 are not drift; they are the served-versus-live capture asymmetry. The
served tree is a rendered, JS-executed capture; the watch fetches raw HTML. Any
region a page fills at runtime is present in `served/` and absent from the live
fetch, and the chrome projection — the non-prose block text ticket 03's copy
projection deliberately leaves out — is where those regions land.

### Evidence (from `/tmp/uw-live.json`, a plain live run)

- **151/170 are form and filter regions.**
  - Marketo form labels: 172 served pages carry a `mktoForm`; every
    `/book-a-demo*` page projects `First Name`, `Last Name`, `Email Address`,
    `Phone Number`, `ZIP Code`, `Organization Name`, … served-only. The rendered
    capture kept the JS-injected labels; the raw fetch carries an empty form.
  - Finsweet CMS filter controls: `fs-cmsfilter-element=filters` (9 pages),
    `=clear` (12), `=empty` (6). `/blog`, `/customers`, `/resources`,
    `/upcoming-events` project served-only filter labels (e.g. `Transportation`,
    `Law Enforcement`). `/faq` projects `General` — the FAQ-category filter
    control (`fs-cmsfilter-field=faq-category … w-form-label`).
  - Webflow pagination: `/partner-program` projects `Previous`, `1234`
    served-only (`w-pagination-wrapper`).
- **1 is the Ashby jobs list.** `data-job-name` is already excluded; the
  surviving text is the list's category chrome (`All Departments`,
  `All Locations`, `Full Time`).
- **1 is the reduce-guard-cost calculator's computed default.**
  `<output id=annualCost class="rc-output bold">$780,000</output>` and
  `<span id=opexSaved class=rc-result>$351,000</span>` project served-only
  against live `$0`.
- **~15 are Wistia player chrome** on `/webinar/*` (`Press O for more options`,
  `Click for sound`, timers such as `1:02:14`). `isGenerated` excludes the
  `wistia-player` tag, but the surviving text is in the player's injected
  wrapper (`span#wistia_61_background_focus_hint`, `button`), not the element.
- **Two survive as real.** `/careers` (`We Aspire Fearlessly` / `We Work Hard`)
  is a real copy finding and `/faq`'s FAQ label is a runtime control; do not
  mask a difference that the strip does not explain.

### What must change

The runtime-filled exclusion set ticket 03 seeds in `isGenerated` and ticket 04
consumes is incomplete. Extend it so a live run's chrome report contains only
differences the strip does not explain — and record the design decisions this
touches:

- **Where the exclusions live.** Say whether each new exclusion belongs in the
  shared `isGenerated` (both projections) or in a chrome-only predicate, and why.
  If `isGenerated` changes, the copy projection changes with it.
- **The baseline.** If excluding regions changes the committed copy digests,
  re-accept the baseline live, update `regression/upstream-baseline.json` and its
  verified-in-sync date, and say which digests moved.
- **The guarantee.** Ticket 04's "what this tier cannot see" note says a chrome
  change inside a runtime-filled region is excluded so real drift cannot hide
  behind it. Keep that guarantee true and test it: removing an exclusion in a
  fixture must make the region re-report, in the same style as ticket 04's
  allow-list fixtures.
- **The measurement.** Record pages differing before, after, and which classes
  remain, from a live run.

## Acceptance criteria

- [x] each runtime-fill class in the evidence is excluded from the chrome
      projection (Marketo forms, Finsweet filter controls, Webflow pagination,
      Ashby job categories, calculator outputs, Wistia player chrome)
- [x] a live run's chrome tier no longer reports those classes; any remaining
      differences are named in the ticket with their evidence
- [x] the 2 real copy findings still report (`/careers`,
      `/products/license-plate-readers`) and no strip-unexplained difference is
      masked
- [x] a fixture proves an excluded region re-reports when its exclusion is
      removed, in the same style as ticket 04's allow-list fixtures
- [x] `npm test` stays offline; the pure seam's vitest project pins the new
      exclusions
- [x] if the baseline's copy/chrome digests change, they are re-accepted live and
      `regression/upstream-baseline.json`'s verified-in-sync date is updated
- [x] the ticket records what each exclusion still cannot see

## Comments

Resolved 2026-09-14. Commit `e7f7a96` carries the code, tests, baseline and
`CONTEXT.md`; this ticket file is the follow-up commit.

### What changed

- `regression/upstream-chrome.mjs`: a new exported, injectable
  `CHROME_RUNTIME_FILL` list beside `CHROME_ALLOW_LIST`, threaded as an optional
  parameter into `chromeRuns` / `chromeMaskedRuns` / `chromeFinding` /
  `chromeReport`. The matcher gained an optional `tag`, an `attrs` map, and a
  `within` matcher (an ancestor element must match) so the Finsweet strip can be
  scoped to the list. Runtime-fill regions are stripped from **both** sides; the
  allow-list stays live-only and counted.
- Why chrome-only, not `isGenerated`: the Finsweet CMS list carries prose the
  copy projection must keep reading, so a shared exclusion would change the copy
  digests and drop real prose. `isGenerated` is untouched; the copy digests did
  not move.
- Entries: `marketo-form` (`class=mktoForm`), `finsweet-cms-hidden-tags`
  (`div.hide` with an ancestor carrying `fs-cmsfilter-element=list`),
  `webflow-pagination` (`w-pagination-wrapper`), `ashby-jobs` (`careers_filter`
  / `careers__listing`), `calculator-output` (`rc-output` / `rc-result`),
  `wistia-player-chrome` (`wistia_popover_embed` / `wistia_embed`), and
  `podcast-player` (`ep-player`).
- The ticket's `fs-cmsfilter-element=filters` bullet is **not** excluded. The
  `/press-center`, `/resources`, `/upcoming-events` differences are real upstream
  dropdown-label renames (`data-text="Region"` with live text `Location`) inside
  the filters form; excluding the form would mask them, which acceptance box 3
  forbids. `=clear` produces no unexplained difference; `=empty` is already a
  shared `isGenerated` exclusion. The actual Finsweet artifact is the hidden
  `div.hide` category tags **inside** `fs-cmsfilter-element=list`, whose order
  the runtime rewrites; the `within` matcher targets exactly those and keeps the
  visible card chrome (FAQ questions, event dates, CTA labels, press outlet
  names) in the comparison. The narrower entry still clears every finding the
  whole-list exclusion did.
- `podcast-player` is beyond the ticket's evidence: the 21 `ep-player` Tmplayer
  blocks on `/podcast` project 24 served-only durations (62:54, …) against live
  repeats of 29:48. Same runtime-fill class, named here as required.

### Seams tested (`test/upstream-chrome.test.ts`, `upstream-chrome` project)

- the entry names, and each region strips to nothing on `chromeRuns`;
- the removal fixture: dropping one entry re-reports its region via
  `chromeFinding` (ticket 04's allow-list fixture style);
- chrome-only: `copyRuns` still reads the `<h3>` inside the list;
- the narrowing: visible `faq_trigger_text` chrome inside the list is kept, and
  an unrelated `div.hide` (the nav template) is not stripped;
- the filters-form guard: a renamed `filter_dropdown-toggle-text` still reports;
- the committed tree as both sides still projects to itself with no findings and
  no allow-list hits.

### Measurement (live `npm run upstream -- --accept`, 2026-09-14)

Before: 1,181 chrome comparisons, **170 differed**. After: **5 differed** —
`/faq`, `/press-center`, `/products/license-plate-readers`, `/resources`,
`/upcoming-events` — all real upstream drift the strip does not explain. (The
`/faq` finding is the `privacy-menu_label` rename — served `General`, live
`Agreements and Policies` — not the FAQ filter control the ticket's evidence
guessed; the filter's `w-form-label` is `General` on both sides.) The other
remaining differences are served `Region`/`Industry`/`Resource Type` against
live `Location`/`Audiences`/`Event Type`+`Audience`. Copy stayed at 2 differed
(`/careers`, `/products/license-plate-readers`), so both real copy findings
still report. Allow-list hits: `account sign-in link`, 4,720 regions. The
steady-state promise itself is pinned offline (the committed tree as both sides
projects to itself); the live report carries those five real drifts because
upstream moved after the Capture froze, which is the alarm, not a false
positive.

### Baseline

`regression/upstream-baseline.json` re-accepted live: **0 copy digests moved,
46 chrome digests moved** (the pages whose live raw HTML also carries a
runtime-fill region — the Finsweet lists and pagination). `verified` stayed
`2026-09-14` (the accept's UTC date, already today). No other row field moved.

### What each exclusion still cannot see

A chrome change *inside* an excluded region: a Marketo label, a pagination link,
a job tag, a calculator output, a Wistia control, a podcast duration, or a
hidden Finsweet category tag. Visible card chrome and the list's prose remain in
the comparison. The runtime-fill strips are silent (not counted); the removal
fixtures are their record, and the allow-list keeps its own counted rule.

### Review

Two-axis review against `52414c1` (working tree, uncommitted at review time).

**Standards — fixed:** the test no longer pins the matcher representation; the
module header scopes the "counted, never silently dropped" rule to the
allow-list and no longer claims "see the ticket for the counts"; `CONTEXT.md`
gains a **Runtime-fill exclusion** glossary entry; a `strippedRoot` helper
removes the duplicated parse+strip; `wistia-player` renamed
`wistia-player-chrome` to distinguish it from `isGenerated`'s `wistia-player`
tag; the orphan JSDoc block merged. **Rejected:** a shared Finsweet owner across
the two tiers (the `=empty`/`=list` split is deliberate and the tiers must stay
able to differ); an options object for the two exclusion lists (consistent with
ticket 04's positional `allowList`, four call sites); treating the chrome module
as divergent (it is the chrome tier's single owner).

**Spec — fixed:** this section records the acceptance evidence, names the
remaining differences, discloses `podcast-player` beyond the ticket's evidence,
and narrows the Finsweet exclusion so visible card chrome is no longer masked
(the axis's C1 finding). **Rejected:** counting the runtime-fill strips in the
report (not asked for; it would change the report and baseline shape, and the
removal fixtures already prove each exclusion is named and removable).
