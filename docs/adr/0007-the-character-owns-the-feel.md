# The character owns the feel; the viewer owns only the volume

The piece told one story about one speaker, so its feel was declared once and globally: a single
typing pace, a single voice pitch, one mark, and the word "Flock" on the typing indicator whatever
was composing. The story now has two characters — Cam, the main one, and Flock, a side character —
who have to read as two people, and the second reading is carried by different marks, different
voice pitches, and different resting typing speeds. A single global pace cannot say that.

At the same time the viewer's Settings page had grown a slider for every lever the piece had,
including the typing, thinking, and pause paces and the voice's pitch and spread. Those are the
piece's dramatic decisions, not a viewer's; the final story wants them set by the author, and a
control that moves nothing (or only re-tunes what the story just fixed) is worse than no control.

## Decision

The speaking **character** owns its presentation: one declaration in `lib/chat-characters.mjs`
carries its id, display name, mark, voice pitch pair, and optional resting reveal pace. A script
line attributes itself by name; the runtime parses the prefix into a `speaker` and every bot block
carries that id, so the mark, the pitch, and the resting pace follow the line's speaker.

The author may **scale** a character's resting pace over a range of a line with the inline marker
`[pace=<preset>]…[/pace]`. The vocabulary is closed to three presets — slowest, slow, normal —
declared in `lib/pace-presets.mjs` as multipliers, and the build's freshness gate fails a value
outside it. The name is `pace`, not Yarn Spinner's own `speed`, because the runtime treats
marker names as opaque and `speed` carries numeric semantics in the engine's Unity dialogue view;
the collision would be harmless in code and expensive in reading.

The vocabulary is three and not five because the reveal is drawn by a requestAnimationFrame
typewriter that advances at most one character per frame **and only on a frame strictly past the
requested delay**. A positive delay below one frame therefore still costs two frames, so the real
per-character step is the requested delay carried to the strictly-next frame, and a character's
effective pace lands on whole-frame steps: 2 frames = 360 wpm, 3 = 240, 4 = 180, 5 = 144. The pace
above which a faster clock cannot advance faster is that two-frame step, and Cam's resting 400 wpm
already sits past it — so on Cam a `fast` or `fastest` preset would be a label that changed the
requested number and not the wall-clock typing at all. Rather than ship two dead labels, the
vocabulary keeps the three presets that are distinct for both characters: `normal` is the resting
pace, and `slow` (×0.7) and `slowest` (×0.5) are genuinely slower, landing on 4/3/2 frames for Cam
and 5/4/3 for Flock. This is the spec's own stated fallback — a smaller vocabulary rather than a
return to a saturated default.

The viewer's Settings collapse to the one lever only they can decide: **volume** — the accessibility
affordance. The `Pacing` shape a turn schedule reads collapses with them: the composing clock and
the floor are piece constants, and the reveal pace comes from the character, not from a viewer's
stored preference.

## Consequences

- The typing pace is a property of the speaker, so two characters read as two people and an
  authored pause reads as the author's, not as the viewer's setting. The closed preset vocabulary
  is what keeps the override dramatic rather than arbitrary.
- The stored preference shape changed, so the key bumps to `flock-chat-settings-v2`
  (`lib/settings`). A stale `v1` copy is left unread rather than coerced.
- [0006](0006-persist-viewer-settings.md)'s key and its list of levers are superseded by this
  record; 0006's rule still holds: settings are never sent anywhere, and no request reads them.
- The turn schedule waits a line out on the frame-rounded step, not the requested delay
  (`revealMsPerChar`), and a line's voice is stopped by its typewriter's own completion event rather
  than by a timer, so the voice ends with the typing it belongs to. The same frame bound is what
  caps the preset vocabulary above.
- Adding a character is one entry in `lib/chat-characters.mjs`, one mark under `public/marks/`, and
  one Yarn name — no turn-contract change, because the contract carries a `speaker` string.
- `npm run chat:check` fails an undeclared speaker or an undeclared preset before the runtime
  ships, so a typo is a loud build failure rather than a silent fallback on the page.
