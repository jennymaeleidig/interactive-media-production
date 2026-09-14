# 06 — Media liveness

Status: resolved
Blocked by: 04, 04b

## What to build

The one class of rot a page edit cannot explain. The media allow-list is the whole
of the exception to the tree's zero-outbound rule, so the frames a served page
carries still reach the network at runtime — the served tree (the 2026-09-12
capture) holds 217 allow-listed slots across 162 pages. When a
media dies upstream, the served page shows a dead player and nobody edited
anything.

This ticket adds the second check to the same report: enumerate every media slot
the tree serves, ask the media host whether each media is alive, and report a slot
whose media is gone as a finding naming the page and the slot. It produces the
same staleness artifact as the index, content and chrome tiers, so the report
stays one artifact rather than two.

The retired workflow's version of this probe reached a media API, an oembed
endpoint and a download tool. The smallest useful version is decided while
building, and the ticket records what it settled for and why — including whether
a media that resolves but refuses to play is in or out of scope.

## Acceptance criteria

- [x] every media slot the tree serves is enumerated from the served bytes, as a
      pure function of a page's HTML
- [x] a slot whose media no longer resolves produces a finding naming the page and
      the slot
- [x] a slot whose media resolves produces no finding
- [x] the check runs over the served tree, not a hand-listed inventory, and
      reports the same slot count the tree holds
- [x] the report stays one artifact: a media finding appears beside index, content
      and chrome findings
- [x] the check reaches no network while `npm test` runs; its driver is hand-run
      like the rest
- [x] the ticket records which liveness signal it settled for and what that signal
      cannot see

## Comments

**Status: resolved.** Hand-off and close are the same state
(`docs/agents/issue-tracker.md`); this ticket-close commit carries the ticked
boxes and this note. Commit: `14ab1fe` — "Add the media liveness tier (ticket
06)".

**What was built.** `regression/upstream-media.mjs` is new and owns the tier as
pure functions: `mediaSlots(html)` enumerates every allow-listed `<iframe src>`
in the served bytes, in document order, parsed by `mediaSlot(url)` to
`{url, provider, id, key}` with keys `wistia:<id>` / `youtube:<id>`;
`livenessUrl(slot)` is the one metadata URL per provider; `mediaLiveness(provider,
status, body)` classifies `alive` / `gone` / `restricted`; and
`mediaReport(pages, probes)` folds a probe map into
`{compared, differed, findings, liveness}`. `runWatch` gains an optional
`mediaPages` / `mediaProbes` input and sets `report.media` beside the index,
copy and chrome findings; the CLI enumerates the served tree, probes each
distinct key once with `mapLimit`, and exits 2 on a transport failure or an
unclassifiable status. The allow-list is imported from `pipeline/audit.mjs`, so
the audit and the watch cannot disagree about which frames reach the network.

**The liveness signal settled for, and what it cannot see.** Each slot is asked
through its media host's own metadata: Wistia's
`fast.wistia.com/embed/medias/<id>.json`, YouTube's oEmbed endpoint
(`?url=<encoded watch url>&format=json`). `alive` is a Wistia body with
`status: "ready"` and at least one delivery asset, or a YouTube oEmbed 200;
`gone` is a 404, or a Wistia 200 that is not ready or carries no asset;
`restricted` is a YouTube 401 (private) or 403 (embed-disabled). The signal
cannot see a media that resolves but refuses to play behind that metadata — a
delivery stream that 403s at play time under a `ready` Wistia entry, a geo-block
— because that needs the retired `yt-dlp` deep tier; and it sees only
allow-listed `<iframe src>` slots, so the 488 `srcdoc` snapshot documents, the 19
`data-video-id` panels the interactions runtime arms, and the 16 `<video>` tags
are outside the census.

**The "resolves but refuses to play" decision — in scope, as the host's metadata
sees it.** The ticket asked whether a media that resolves but will not play is
in or out. Settled: in, but only as far as the host's own metadata reports it.
Wistia's `status`/`assets` and YouTube's 401/403 are exactly the "exists but not
playable here" cases those APIs expose, so they are findings (`gone` for a
non-ready Wistia, `restricted` for a disabled YouTube embed) rather than clean
slots — a served page showing a dead player is the rot this tier exists to
catch. A stream that refuses at play time behind a metadata `ready` is out of
scope: it would require the retired deep tier, and the smallest useful version
does not carry it.

**The measured census (2026-09-12 tree).** 217 allow-listed slots across 162
pages — 130 `fast.wistia.net`, 84 `www.youtube.com`, 3 `www.youtube-nocookie.com`
— deduping to 197 distinct keys, because the two YouTube hosts share one
`youtube:<id>` key. `served/build-summary.json`'s `embeds.live = 217` /
`embeds.pages = 162` independently agrees. The ticket body's old "91 frames
across 74 pages" was the capture-time count of src-less frames re-captured after
`--save-original-urls` (README line 91), not the served tree's slot count, and
was corrected here.

**Seams tested** (`test/upstream-media.test.ts`, new `upstream-media` vitest
project, no network): slot parsing for all three hosts plus unknown paths and
hosts, protocol-relative frames normalized so the census matches the audit, the
two YouTube hosts deduping, `mediaSlots` order/duplicates/ignores, each liveness
class and the throw on an unclassifiable status, the report's tally so it sums
to `compared`, findings deduped by page and slot and sorted, the throw on a
missing probe and on an unclassifiable slot, `runWatch` including `report.media`
only when handed the media inputs and firing exit 1 on dead media even on the
silent first run, and a tree-wide slice over the committed served bytes asserting
217 slots / 162 pages / 130+84+3 / 197 keys and `compared = 217, differed = 0`
with synthesized all-alive probes.

**Review findings, two axes vs fixed point `3261726`.** Standards — fixed:
`CODING_STANDARDS.md` did not name the new module, its test seam, or the new
CONTEXT terms (all three added); an accidental newline deletion outside the media
hunk restored; `report.media` re-listed every `MediaReport` field instead of
assigning the report the core returned; `probeMedia` read a body for every host
though only Wistia's metadata carries one (now gated to a Wistia 200); the
CONTEXT "2026-09-14 tree" wording implied the measurement date was the frozen
tree's. Rejected: the CLI's `key === null` guard duplicating `mediaReport`'s
throw — kept deliberately so an unmeasurable census fails before ~197 network
probes, with the pure core still owning the rule. Spec — fixed: the ticket had
not recorded the settled signal/blind spots or the resolves-but-refuses-to-play
decision (this note); the stale 91/74 figure (corrected); a latent mismatch where
a protocol-relative allow-listed frame passed the audit's allow-list but the
census called it unclassifiable (normalized in `mediaSlot`). Rejected: the
`restricted` class and Wistia not-ready-as-`gone` as "scope creep" / "AC3
violation" — the ticket explicitly asked to decide the resolves-but-refuses-to-
play case, and that is the decision this note records.

**Verification.** `npm run typecheck` clean; `npm test` 22 files / 395 tests green
and offline; `npm run build` succeeds. The CLI edge stays outside the suite and
is hand-run (`npm run upstream`).
