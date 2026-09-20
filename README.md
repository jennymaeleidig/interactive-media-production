# interactive-media-production

The piece behind `flocksafety.cam`: a public, unlisted artwork that reproduces
Flock Safety's surface closely enough to be mistaken for it, and says so behind a
`?`. It is a static export — one page, one scripted conversation, no server.

The conversation is chips-only. The shell is vercel/chatbot's chat chrome with
Flock's identity over it (see `components/NOTICE.md`); the dialogue is the Yarn
program and the client-side engine. The piece asks its viewer for nothing and
embeds nothing: no form, no analytics, no frames, no images. Its only network
reach is a viewer's own click on an external link.

## What runs

- **The dialogue program** — `dialogue/flock.yarn`, compiled once at build time
  into `pipeline/chat-program.json`.
- **The block inventory** — `pipeline/chat-blocks.mjs`: the hand-reviewed
  declaration every `<<block "id">>` resolves against, and the source of the
  no-ask rule's (currently empty) allowlist.
- **The engine** — `pipeline/chat-engine.mjs`: the block-carrying turn contract
  declared in `pipeline/chat-turn.mjs`, a Yarn `Dialogue` rebuilt from a snapshot
  on every turn, and the session in `localStorage`.
- **The runtime** — `pipeline/chat-runtime.js`, generated: the engine bundle with
  the program and inventory inlined. `/chat/runtime.js` publishes it.
- **The shell** — `components/chat/`, mounted by `app/page.tsx`; it reaches the
  engine only through `window.__flockChatEngine`.
- **The pages** — `app/page.tsx` (the piece) and
  `app/legal/privacy-policy/page.tsx` (the privacy page).

## Working on it

```bash
npm install
npm run dev            # the piece at http://localhost:3000
```

Editing the conversation means editing `dialogue/flock.yarn` (and adding any new
block id to `pipeline/chat-blocks.mjs`) and regenerating:

```bash
npm run chat:build     # write chat-program.json and chat-runtime.js
npm run chat:check     # fail if the committed bytes no longer follow
```

Both generated files are committed, because the export ships them and nothing
regenerates them during a build.

## Checks

```bash
npm run typecheck      # tsc --noEmit, plus checkJs over the chat's own JavaScript
npm test               # the seams: engine, shell, inventory, interface, verdicts
npm run build          # next build, writing the static export to out/
npm run check:artifact # the export, read back over HTTP
```

`npm test` is the fast suite and needs no build. `npm run check:artifact` is
environmental — it serves `out/`, asserts the host page names the published path,
carries the honest preview metadata and the `?`, that the published bytes are the
maintained source, and that the privacy path resolves — so it runs after
`npm run build`.

## Layout

| Path          | What lives there                                                        |
| ------------- | ----------------------------------------------------------------------- |
| `app/`        | the routes, the token stylesheet, and the published chat route          |
| `components/` | the vendored shell (see `components/NOTICE.md`) and the Flock assets      |
| `dialogue/`   | the Yarn sources                                                        |
| `hooks/`      | `useDialogue`, the shell's replacement for `useChat`                    |
| `lib/`        | the shell's types, class-name helper, and canonical honest string       |
| `pipeline/`   | the engine, the block inventory, the published-byte declaration, builder |
| `test/`       | the seams and their shared harness                                      |
| `regression/` | the artifact check                                                      |
| `docs/`       | the brand reference, the ADRs, and the share kit                        |

## Publishing

`.github/workflows/publish.yml` runs typecheck, tests, the freshness check, the
build and the artifact check, then uploads `out/` to GitHub Pages.
