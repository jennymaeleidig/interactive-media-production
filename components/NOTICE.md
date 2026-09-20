# Vendored shell: vercel/chatbot

The chat surfaces in this directory are a trimmed, adapted port of
[vercel/chatbot](https://github.com/vercel/chatbot), Apache-2.0. A copy of the
template's license is in `LICENSE` beside this file. The template's own copyright
notice is preserved there.

## What was kept

- `chat/messages.tsx` — the transcript's scroll surface, rewritten to render a
  serverless block sequence through `use-stick-to-bottom`.
- `chat/message.tsx` — the idea of a part switch, rewritten as the committed
  block adapter table (one entry per block type).
- `chat/composer.tsx` — the composer row, gutted from `multimodal-input.tsx`:
  a chip row and an inert send glyph, no input, no attachments, no model picker.
- `chat/icons.tsx` — the send and external-link glyphs, redrawn.

## What was dropped outright

The sidebar tree, the artifacts machinery (ProseMirror/CodeMirror), tool parts,
reasoning, votes, documents, `greeting.tsx`, and every server surface: NextAuth,
Drizzle/Postgres, Redis, the AI SDK routes, OpenTelemetry, rate limiting, blob
storage, and the SWR history/model hooks. Nothing is stubbed.

All four of the template's client runtime dependencies are taken, each doing the
job it did there: `use-stick-to-bottom` pins the transcript, `framer-motion`
runs the block rise (with `useReducedMotion`), `next-themes` pins the one ground
Flock's identity fixes, and `lucide-react` supplies the send glyph.

## Licensing

The Apache-2.0 notice covers the template's work in these files only. The Flock
mark and typefaces in `components/brand/wordmark.tsx` and `public/fonts/` are
Flock Group Inc's, are not covered by it, and carry no license claim anywhere.
See `docs/brand.md` for per-asset provenance.
