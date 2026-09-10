# Brief — wayfinding ticket 02: Behavioral machinery of flocksafety.com

You are a pi research agent for effort `flock-parody` in this repo. Work alone (AFK). Follow steps in order; do not modify any other files than the three named below.

1. Read `.scratch/flock-parody/map.md` and `.scratch/flock-parody/issues/02-behavioral-machinery.md` (your ticket).
2. Claim the ticket: set the ticket file's `Status:` line to `claimed` before any research.
3. Read and follow the research skill at `~/.pi/agent/skills/research/SKILL.md`.
4. Research the ticket's question using two evidence sources:
   - The committed capture `.scratch/flock-parody/research/flocksafety/index.html` (11.9 MB single-file HTML of the homepage, post-render). Static analysis: grep with tight patterns and offset reads — never read it whole. Extract: fonts (families/weights/sources actually served), animation classes and libraries (split-text effects, scroll reveals), video sources and behavior, the Qualified chat widget's mount/DOM/config, tracker scripts (GTM, pixels, Qualified telemetry), and cookie-consent machinery.
   - The live site, where the capture is not enough. In THIS session you are not sandbox-fenced: headless Chromium can run natively, and the bladebro extension's browser tools (`browser.act` / `browser.see` / `browser.state`) load at your startup. Use them to observe the chat widget's UX flow (bubble → window → conversation), scroll animations, and anything invisible in static HTML. Also note the endpoints/payload shapes the Qualified widget calls — the Recreation must mimic the UX, not call those endpoints. Observe passively; never submit real inquiries through the live chat.
   - Fallback: if browser processes fail with EPERM, use the Docker pipeline (`docker run --rm -v "$PWD":/out capsulecode/singlefile <url> out.html`) or stick to static analysis and say so in your coverage caveats.
5. Resolve the ticket:
   - Write your **full findings** — the behavioral checklist (animations, video, fonts, the Qualified widget's UX flow + visual tokens + endpoint shapes, the tracker strip-list, cookie-consent behavior), each item marked MUST-REPRODUCE or STRIP/DEFER, plus coverage caveats — to `.scratch/flock-parody/research/02-behavioral-machinery.md`.
   - Append an `## Answer` section to `.scratch/flock-parody/issues/02-behavioral-machinery.md` containing only a short gist and a link to the research file above.
   - Set the ticket's `Status:` to `resolved`.
   - Append one line under `## Decisions so far` in `.scratch/flock-parody/map.md`:
     `- [Behavioral machinery of flocksafety.com](issues/02-behavioral-machinery.md): <one-line gist>`

Later tickets depend on this: the chat-wrapper prototype (04) needs the widget's UX flow and visual tokens; the snapshot-serving pipeline prototype (05) needs the font/animation/video checklist and the strip-list.
