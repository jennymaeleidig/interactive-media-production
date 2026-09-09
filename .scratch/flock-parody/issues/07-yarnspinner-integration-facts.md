Status: resolved
Type: research
Blocked by: —

## Question

What are the exact build/runtime integration facts for **yarnspinner-ts** that the chat wrapper prototype (ticket 04) needs to decide server-side-runtime-vs-client-bundle and vite-plugin-vs-node-loader? Current knowledge is a past session's summary; this ticket pins the API ground truth.

Sources: the local sibling repo `/Users/jennyleidig/Documents/projects/interactive-media/yarnspinner-ts` (bash may be sandbox-fenced for it — use pi's in-process read/find tools, which reach it) and its public GitHub/npm presence.

Facts to pin (document each with file/version references):

1. **`Dialogue` runtime**: construction signature, pull API (`continue()` / `selectOption()` event shapes — exact `LineEvent`/`OptionsEvent`/other event types and payloads), error handling, dialogue-completion signaling.
2. **`VariableStorage`**: interface, the serialization story (can storage be snapshot/restored per HTTP request — what exactly serializes?).
3. **Node project loader** (`yarnspinner-typescript/node`): API — inputs (file paths? project object?), output (compiled program? Dialogue-ready?), runtime cost, whether it can load `.yarn` at request time or startup.
4. **`yarnspinner-vite-plugin`**: what it emits (program JSON? JS module? virtual module id?), its options, and concretely what it would take to reuse its compile step under Next.js (standalone compile script emitting JSON consumed at runtime/build).
5. **Versions/peers**: package names and versions on npm, peer deps, ESM/CJS module format of each entry point (matters for Next.js bundling), license.

Deliverables: full findings in `research/07-yarnspinner-integration-facts.md`; short-gist `## Answer` here; Decisions-so-far line on `map.md`.

## Answer

Pinned against the local sibling repo @ `f40e32b` (both packages, v1.0.0) — full detail with exact signatures in [research/07-yarnspinner-integration-facts.md](../research/07-yarnspinner-integration-facts.md).

- **Gate fact**: neither package is on npm (registry 404, verified 2026-09-09 three ways) and the GitHub repo is private — install is `file:../yarnspinner-ts` / `npm pack` / publish-first decision. Local `dist/` (ESM+CJS) is already built.
- **`Dialogue`**: `new Dialogue(program, opts)` — sync; pull API `continue(): DialogueEvent[]`, `selectOption(index | noOptionSelected)`, `setNode`, `stop`; 7 camelCased event types (`line`/`options`/`command`/`nodeStart`/`nodeComplete`/opt-in `lineHints`/`dialogueComplete`); runtime failures are `logError`/`logDebug` diagnostics, never throws; completion = `dialogueComplete` + `isComplete`. `pullUntilStopped`/`runUntilStopped`/`Transcript` helpers ship in-package — the wrapper's per-turn loop is already written.
- **`VariableStorage`**: 4-method interface (`has/get/set/entries`); serialization story = `entries()` only (story vars + `$Yarn.Internal.*` generated vars — once-state, visit counts, saliency history; all JSON-safe). VM position (ip/stack/pending options) does **not** serialize — restore restarts the current node from its top.
- **Node loader** (`yarnspinner-typescript/node`): `loadYarnProject(path)` — sync, reads a `.yarnproject`, resolves globs, compiles → `LoadProjectResult` whose `program` is a plain versioned-JSON artifact (straight into `Dialogue`, survives `JSON.stringify`). Works at request time or startup; fs-free core (`loadProject`) takes an injected filesystem.
- **Vite plugin**: no virtual modules — real-file ids; `.yarn` → default export `JSON.stringify(program)` + named stringTable/fileTags; `.yarnproject` → full load result. Compile steps (`compileYarnModule`/`compileYarnProjectModule`) are exported, bundler-agnostic — Next.js webpack-mode loader is a thin shim; **Turbopack has no loader API** → documented SSR path: `loadYarnProject()` once per deploy, pass the program across the serialization boundary.
- **Versions/peers**: both CC0-1.0, zero runtime deps; core dual ESM/CJS, plugin ESM-only; plugin peers `vite ^5||^6||^7` + `yarnspinner-typescript ^1.0.0`; no engines fields; upstream parity target YS 3.2.2.

For ticket 04: server vs client both viable (main entry is browser-safe, dual-format); under Turbopack the SSR startup-singleton path is the zero-friction route; the snapshot/restore gap (node-top restart) pushes the yarn script toward one-node-per-turn unless Dialogues live in server memory.
