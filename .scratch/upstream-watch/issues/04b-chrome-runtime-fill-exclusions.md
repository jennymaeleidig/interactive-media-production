# 04b — Chrome-tier runtime-fill exclusions

Status: open
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

- [ ] each runtime-fill class in the evidence is excluded from the chrome
      projection (Marketo forms, Finsweet filter controls, Webflow pagination,
      Ashby job categories, calculator outputs, Wistia player chrome)
- [ ] a live run's chrome tier no longer reports those classes; any remaining
      differences are named in the ticket with their evidence
- [ ] the 2 real copy findings still report (`/careers`,
      `/products/license-plate-readers`) and no strip-unexplained difference is
      masked
- [ ] a fixture proves an excluded region re-reports when its exclusion is
      removed, in the same style as ticket 04's allow-list fixtures
- [ ] `npm test` stays offline; the pure seam's vitest project pins the new
      exclusions
- [ ] if the baseline's copy/chrome digests change, they are re-accepted live and
      `regression/upstream-baseline.json`'s verified-in-sync date is updated
- [ ] the ticket records what each exclusion still cannot see
