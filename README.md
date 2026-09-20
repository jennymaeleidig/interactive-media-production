# interactive-media-production

A chat assistant on one page, built as a static export. The page carries the chat
and nothing else: no reconstruction of another site, no server, and no request
that leaves the browser.

The chat is the fidelity work. Its launcher, expanded panel, choice chips, pinned
copy, icons and typeface are the captured widget's, and they arrive as the
widget's own bytes — `pipeline/chat-widget.css` holds its surfaces and embeds its
typeface and images as data URIs, while `pipeline/chat-runtime.js` is the
compiled dialogue engine followed by the widget that mounts it. The conversation
runs entirely in the page.

## What runs

- **The dialogue program** — `dialogue/flock.yarn`, compiled once at build time
  into `pipeline/chat-program.json`.
- **The engine** — `pipeline/chat-engine.mjs`: the turn contract declared in
  `pipeline/chat-turn.mjs`, a Yarn `Dialogue` rebuilt from a snapshot on every
  turn, and the session in `localStorage`.
- **The widget** — `pipeline/chat-widget.js`, with `pipeline/chat-widget.css`.
- **The runtime** — `pipeline/chat-runtime.js`, generated: the engine bundle with
  the program inlined, then the widget verbatim, as one file, so the two cannot
  ship out of step.
- **The pages** — `app/page.tsx` (the host) and
  `app/legal/privacy-policy/page.tsx` (the page the widget's footer links to).

## Working on it

```bash
npm install
npm run dev            # the piece at http://localhost:3000
```

Editing the conversation means editing `dialogue/flock.yarn` and regenerating:

```bash
npm run chat:build     # write chat-program.json and chat-runtime.js
npm run chat:check     # fail if the committed bytes no longer follow
```

Both generated files are committed, because the export ships them and nothing
regenerates them during a build.

## Checks

```bash
npm run typecheck      # tsc --noEmit, plus checkJs over the chat's own JavaScript
npm test               # the seams: engine, widget, rule, declaration, verdicts
npm run build          # next build, writing the static export to out/
npm run check:artifact # the export, read back over HTTP
```

`npm test` is the fast suite and needs no build. `npm run check:artifact` is
environmental — it serves `out/`, asserts the host page names both published
files, that both answer with the maintained bytes, and that the privacy path
resolves — so it runs after `npm run build`.

## Layout

| Path          | What lives there                                                              |
| ------------- | ----------------------------------------------------------------------------- |
| `app/`        | the routes: the host page, the privacy page, and the two published chat files |
| `dialogue/`   | the Yarn sources                                                              |
| `pipeline/`   | the chat's engine, widget, published-byte declaration and runtime builder     |
| `test/`       | the seam harness and the tests                                                |
| `regression/` | the artifact check                                                            |

## Publishing

`.github/workflows/publish.yml` runs typecheck, tests, the freshness check, the
build and the artifact check, then uploads `out/` to GitHub Pages.
