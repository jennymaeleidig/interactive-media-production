# CONTEXT.md

Glossary for this repo. Terms are added as they resolve in conversation; no implementation detail lives here.

## Terms

- **The piece** — the chat and the page that carries it: one launcher, one conversation, one canvas with nothing else on it. _Avoid_: the site, the demo, the app.
- **Widget** — the chat's own interface: the launcher, the expanded panel, the pinned header and footer bands, the inert composer, the chips. Its surfaces, copy and typeface are the captured widget's, and they ship as its own bytes. _Avoid_: bubble, chat window, chatbot UI.
- **Chat runtime** — the one file the page loads for behaviour, `/chat/runtime.js`: the dialogue engine bundled with the program inlined, followed by the widget that mounts it. They cannot ship out of step because they are one file. _Avoid_: bundle, main script.
- **Dialogue program** — `dialogue/flock.yarn`, compiled to `pipeline/chat-program.json` at build time, because a browser cannot compile Yarn.
- **Turn contract** — the request and response shape declared in `pipeline/chat-turn.mjs`: start / resume / option in, lines, choices and variables out. The widget speaks it; the engine answers it.
- **Session** — `localStorage['flock-chat-session']` (the conversation's id) and `localStorage['flock-chat-state']` (the engine's snapshot). A reload resumes rather than restarts. _Avoid_: history, transcript, thread.
- **Pinned copy** — the fixture's canonical strings, transcribed from one observed session and locked by the tests, so a copy change fails a test instead of drifting. _Avoid_: canned answers, canned responses.
- **Hub option set** — the shared choice set (help / Get a Demo / Support) re-offered to the visitor without repeating the greeting. The email gate returns here, so the conversation never dead-ends.
- **Email gate** — the demo ask that stops: the fixture collects no address and books no meeting. _Avoid_: lead capture, contact form.
- **Inert composer** — the message box and send icon are present and do nothing; only the chips advance the conversation. _Avoid_: disabled input, stub, placeholder form.
- **Published path** — a URL the host serves from a maintained file, declared in `pipeline/chat-assets.mjs`: `/chat/runtime.js` and `/chat/widget.css`. There is one declaration because the route, the artifact check and the widget seam all read it. _Avoid_: static asset, mirror, bundle name.
- **No-network rule** — the chat's bytes name no network primitive at all (`pipeline/chat-source.mjs`). It is the piece's privacy contract, not a performance preference.
- **Seam** — a place where a test drives the piece from outside: the engine seam, the widget seam, and the artifact seam. _Avoid_: unit boundary, integration layer, mock.
- **Freshness gate** — `npm run chat:check`: regenerate the program and the runtime in memory, and fail when the committed files differ.
- **Artifact check** — `npm run check:artifact`: the built export, read back over HTTP. Environmental rather than a suite member, because it needs a build.
