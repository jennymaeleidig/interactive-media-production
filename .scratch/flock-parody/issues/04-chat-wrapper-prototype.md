Status: resolved
Type: prototype
Blocked by: 02, 06, 07

## Question

How does the cloned chat widget bind to yarnspinner-ts? Build the cheapest concrete thing that answers it: a stub chat window matching the Qualified UX (from ticket 02) wired to a `Dialogue` instance through a Next.js API route, driven by a minimal throwaway Yarn fixture — real script content is the user's future effort.

Decisions the prototype must pin:
- **Where the runtime lives**: server-side API route (per-session state — restore via injected, serialized `VariableStorage`) vs client-side bundle; and the resulting message API shape.
- **How `.yarn` content enters the build**: the repo's yarnspinner-vite-plugin does not plug into Next.js natively — the realistic options are the Node project loader (`yarnspinner-typescript/node`) at runtime, or a build-time compile step emitting program JSON (ticket 07: the plugin's compile steps are bundler-agnostic exports, so a thin webpack-mode loader or an SSR startup-singleton both work; Turbopack has no loader seam). The user's instinct was "use the vite plugin"; surface what that actually takes in Next.js and pick.
- **How yarnspinner-ts itself is depended on**: neither package is on npm and the repo is private (ticket 07) — pick between `file:../yarnspinner-ts`, vendoring `dist/`, or a packed tarball; the spec's build instructions follow from this.
- **Fixed copy, not live**: Qualified's greeting/replies are GPT-generated per session (ticket 06) — the Recreation must pin ONE fixed string set. Build the throwaway fixture by transcribing one observed session (evidence walks s9/s10/s11 in `research/evidence/06-qualified-conversation-ux/`); note the pinned copy in the answer so the spec can reference it.
- **The wrapper's interface**: what the cloned widget calls, what comes back (`LineEvent`/`OptionsEvent` → chat bubbles/quick replies), how variables and session state persist across requests.

Link the prototype as an asset; record the interface decisions in the answer.

## Answer

Resolved 2026-09-09 — prototype built, walked by the user, reworked to their UI direction, and re-verified end-to-end. Prototype (throwaway, runnable): **`prototypes/chat-wrapper/`** — see its [README](../../prototypes/chat-wrapper/README.md) for the full decision write-out and environment facts. `lib/chat-engine.ts` is the liftable part.

1. **Runtime: server-side, SSR startup-singleton** (user ratified). `loadYarnProject()` compiles once at API-route module load; one `Dialogue` per session in a module-level Map (server memory — session survives page reload exactly like Qualified's server-side session). Zero bundler config; identical under Turbopack and webpack, dev and build. The vite plugin is **not** used: webpack-mode loader shim only would work, Turbopack has no seam, and the plugin's own doc assigns deployment-data content to the SSR path.
2. **Dependency: npm `file:` on the local sibling via absolute system path** (user: local for now, publish later). Relative `file:../../…` specifiers DO NOT survive npm resolution here — workspace-root inference produces a dangling symlink; absolute paths work. Dev reads the sibling live (no reinstall on its edits).
3. **Message API**: one POST — `{type: start|resume|option, …}` → turn batch (lines / pending choice set / complete) + `state.vars` = literally `VariableStorage.entries()` surfaced every turn. `start` is idempotent (a live session resumes instead of resetting). Shape adjustable later (user OK).
4. **UI contract (user direction, reworked in-session): no composer, no free text, no persistent chips.** Every choice is a Yarn option (`->`) authored in the script; the wrapper renders the pending set as user-style bubbles sitting IN the composer slot — clicking one reads as sending your own typed message. Clicks are `selectOption()`; node-top-restart caveat only bites across server restarts. Fixture nodes each end in an option set (choices loop through general/support/demo or exit to `end`). The `<<cta>>` custom-command mechanism from the first build is dead.
5. **Pinned copy** (verbatim, evidence s9/s10/s12; s9 greeting stands as canonical): greeting "Hey there! I’m Flock, your friendly AI Sales Assistant. What questions do you have about Flock’s offerings today?"; general reply "I’m here to assist with any questions…"; support reply "You can reach our support team…"; demo ask "I’d be happy to help you book a demo! Could you please provide your email address?". The demo path deliberately ends at the email gate (divergence noted in-script) — booker depth stays a spec-time decision (map fog).
6. **Environment facts for the real app** (full list in the README): `WATCHPACK_POLLING=true` is required for `next dev` under the sandbox (native watcher denial silently blanks the dev route manifest); a `browserslist` package field is required (the CSS config-walk otherwise climbs out of the fence and dies on EPERM); **a `//` comment placed between Yarn options silently drops every option after it** — keep comments at line level (verified; no diagnostic fires).

Not carried into code (deliberate): the ~4s `auto_respond` reply delay, sent/received sounds, operator/typing-dot path — hooks noted in the widget source, none under test.

## Comments

**2026-09-09 (working session):** Prototype built at `prototypes/chat-wrapper/` — running Next.js app, stub widget per the ticket-06 geometry contract, wired to vendored yarnspinner-ts. All four decision axes implemented and smoke-tested end-to-end (start / CTA / typed text / inline options / resume-replay); every pinned string verified verbatim in transit. Two new environment facts surfaced (recorded in the prototype README): `WATCHPACK_POLLING=true` required for `next dev` under the sandbox, and a `browserslist` package field required to keep the CSS config-walk inside the fence. Ticket stays **claimed**: prototype tickets resolve through the user's reaction — decisions presented, awaiting live exchange before the `## Answer` is recorded.
