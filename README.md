# interactive-media-production

The piece behind `flocksafety.cam`: a public, unlisted artwork that reproduces
Flock Safety's surface closely enough to be mistaken for it, and says so behind a
`?`. It is a static export — one page, one scripted conversation, no server.

The conversation is chips-only. The shell is vercel/chatbot's chat chrome with
Flock's identity over it (see `components/NOTICE.md`); the dialogue is the Yarn
program and the client-side engine. The piece asks its viewer for nothing and
embeds nothing: no form, no analytics, no frames, no images. Its only network
reach is a viewer's own click on an external link.

## Working on the script

The dialogue compiles out of the Yarn sources in `assets/dialogue/`
(`core.yarn`, `products.yarn`, `trust.yarn`) into two generated,
committed files (`scripts/chat-program.json`, `scripts/chat-runtime.js`), and
the asset route reads the runtime from disk on every request — so the dev loop
needs no server restart, only a recompile:

1. `npm run dev` — the page.
2. `npm run chat:watch` — recompiles both generated files on every save to the
   Yarn sources or the modules the engine bundles, debounced, and keeps going
   after a compile error (the last good bytes stay in place). `npm run
   chat:build` is the same compile, once.
3. In the browser: reload, then `?` → **Start over**. The session is persisted in
   `localStorage`, so a reload resumes the conversation already on screen and
   would otherwise keep showing old copy; **Start over** drops it and replays the
   greeting from the program just compiled. The control is dev-only.
