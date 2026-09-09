# Research: yarnspinner-ts integration facts (ticket 07)

Date: 2026-09-09. Sources: local sibling repo `~/Documents/projects/interactive-media/yarnspinner-ts` (git `f40e32b`, package version 1.0.0, working tree clean apart from an `allowScripts` package.json edit) plus live checks of registry.npmjs.org and api.github.com the same day. All file references below are paths in that repo; line-level API shapes are quoted verbatim.

---

## 0. Distribution status — the gate fact

**Neither package is on the public npm registry, and the GitHub repo is not public.** Verified three independent ways on 2026-09-09:

- `npm view yarnspinner-typescript` / `npm view yarnspinner-vite-plugin` → `E404 Not found` from registry.npmjs.org.
- Direct `GET https://registry.npmjs.org/yarnspinner-typescript{,-vite-plugin}` → HTTP 404.
- Registry search `/-/v1/search?text=yarnspinner` → returns only unrelated packages (bondage.js family, react-three-yarnspinner-dialogue); neither name exists.
- `GET https://api.github.com/repos/jennymaeleidig/yarnspinner-typescript` → HTTP 404 (the repo the README/docs link to is private or unpushed).

Despite `CHANGELOG.md` announcing "1.0.0 … first public release, published as `yarnspinner-typescript`", the registry has no such package today. The local repo is publish-ready (`"private": false`, `files:` whitelist, dual-format `dist/` **already built** — `dist/index.js`/`index.cjs`/`index.d.ts` and `packages/vite-plugin/dist/` all present), so:

- **Consequence for ticket 04**: install from the local sibling, not npm — `"yarnspinner-typescript": "file:../yarnspinner-ts"` (works against the built `dist/`), or `npm pack` the tarball, or `git+ssh` once the repo is pushed. Whether to actually publish is the user's call; until then every doc statement of "npm install yarnspinner-typescript" is aspirational.

## 1. `Dialogue` runtime

Source: `src/runtime/dialogue.ts`, `src/runtime/events.ts`, `src/runtime/vm.ts`, `src/runtime/transcript.ts`. Parity target: upstream Yarn Spinner 3.2.2 (CITATION.cff); pull API shape adopted from the Rust port (ADR 0002).

### Construction

```ts
export class Dialogue {
  constructor(program: Program, opts: DialogueOptions = {});
}
```

Synchronous; nothing throws on bad content. `DialogueOptions` (`src/runtime/events.ts`):

```ts
export interface DialogueOptions {
  startAt?: string;                    // default "Start" (defaultStartNodeName)
  library?: Library;                   // host functions/command handlers over the built-ins
  variables?: Record<string, unknown>; // initial values, "$" prefix optional, applied after <<declare>> seeding
  variableStorage?: VariableStorage;   // the persistence seam — see §2
  lineHints?: boolean;                 // opt-in LineHints events
  contentSaliencyStrategy?: ContentSaliencyStrategy;
  textProvider?: TextProvider;         // line-id → text resolver for localisation
  logError?: (message: string) => void; // default console.error
  logDebug?: (message: string) => void; // default silent
}
```

### Pull API

```ts
continue(): DialogueEvent[];                                // run to the next stopping point
selectOption(selectedOption: number | typeof noOptionSelected): void;
setNode(title: string): void;   // (re)enter a node; variables/once/visits preserved
stop(): void;                   // discard execution state; complete event rides the next continue()
```

State getters: `currentNode: string | null`, `isActive: boolean`, `isWaitingForOptionSelection: boolean`, `isComplete: boolean`. Helpers: `getLibrary()`, `getVariables(): Readonly<Record<string, unknown>>` (story variables, generated keys excluded), `getVariable`/`setVariable`, `tryGetSmartVariable`, `nodeExists`, `nodeNames`, `getStringIDForNode`, `setLanguage`, `setSaliencyStrategy`, saliency queries (`isNodeGroup`, `getSaliencyOptionsForNodeGroup`, `hasSalientContent`), `getLineParser`.

Constants: `noOptionSelected = -1` (fall through the options block), `defaultStartNodeName = "Start"`.

### Event vocabulary (`src/runtime/events.ts`, camelCased, discriminated on `type`)

```ts
export interface LineEvent  { type: "line";  lineId?: string; speaker?: string; text: string; tags?: string[]; markup?: MarkupParseResult; }
export interface DialogueOption { index: number; isAvailable: boolean; text: string; tags?: string[]; markup?: MarkupParseResult; }
export interface OptionsEvent { type: "options"; options: DialogueOption[]; }
export interface CommandEvent { type: "command"; command: string; }
export interface NodeStartEvent { type: "nodeStart"; nodeName: string; scene?: string; }
export interface NodeCompleteEvent { type: "nodeComplete"; nodeName: string; }
export interface LineHintsEvent { type: "lineHints"; lineIds: string[]; }  // only when lineHints: true
export interface DialogueCompleteEvent { type: "dialogueComplete"; }

export type DialogueEvent =
  | LineEvent | OptionsEvent | CommandEvent
  | NodeStartEvent | NodeCompleteEvent | LineHintsEvent | DialogueCompleteEvent;
```

Semantics that shape a wrapper: the delivered option set contains **all** options with `isAvailable` flags (advisory — the UI decides whether to render unavailable ones; any index may be selected). `<<set>>/<<declare>>/<<call>>` never surface as `Command` events. `text`/`command` arrive with `{expr}` substitutions already expanded; `markup` carries the parsed markup spans.

### Error handling and completion

- **Runtime failures are diagnostics, not throws** — they surface through the `logError`/`logDebug` option callbacks (`dialogue.ts` module doc: "Runtime failures are diagnostics, not throws"). Exceptions are reserved for host programming errors (e.g. duplicate `Library.registerFunction`).
- Completion is signaled by a `dialogueComplete` event, mirrored in the `isComplete` getter. `stop()` completes the machine but its event delivers on the *next* `continue()`.

### Orchestration helpers (directly reusable by the chat wrapper)

`src/runtime/transcript.ts` ships the pull-loop every consumer would otherwise re-paste:

```ts
export type StoppingPoint = "line" | "options" | "command" | "complete";
export interface Transcript { lines: TranscriptLine[]; options: DialogueOption[] | null; commands: string[]; scene?: string; }

export function pullUntilStopped(dialogue: Dialogue): { events: DialogueEvent[]; stopped: StoppingPoint };
export function runUntilStopped(dialogue: Dialogue, prior?: Transcript): { transcript: Transcript; stopped: StoppingPoint };
export function runUntilComplete(dialogue: Dialogue, prior?: Transcript): { transcript: Transcript; stopped: StoppingPoint };
export function mergeEvents(events: DialogueEvent[], prior?: Transcript): Transcript;
```

`pullUntilStopped` guards both at-rest states (pending selection, complete) so a naive call cannot run away; `runUntilStopped` auto-continues across line/command stops and returns the accumulated `Transcript` — effectively the per-turn batch a chat wrapper renders. The worked example (`examples/browser/transcriptDemo.ts`) is a plain-TS consumer of exactly this pair, no framework.

### Library (host surface)

`src/runtime/library.ts`: `Library.registerFunction(name, fn, signature?)`, `registerCommandHandler(name, handler)`, plus deregister/has. `FunctionSignature = { params: DeclaredValueType[]; variadic?: boolean; returns: DeclaredValueType }`, `DeclaredValueType = "number" | "string" | "bool" | "any"`. A `Library` passed to `compile()` feeds build-time signature checking; the runtime keeps its own instance (host entries imported via `DialogueOptions.library`).

## 2. `VariableStorage` — interface and the serialization story

Source: `src/runtime/variableStorage.ts`, `src/runtime/generatedVariables.ts`.

```ts
export interface VariableStorage {
  has(name: string): boolean;
  get(name: string): unknown;
  set(name: string, value: unknown): void;
  entries(): Iterable<[string, unknown]>;   // every pair, generated variables included
}
export class InMemoryVariableStorage implements VariableStorage { /* Map-backed */ }
```

**All** story state lives in one storage: authored variables **plus generated variables** under the reserved `$Yarn.Internal.` namespace — once-state (`$Yarn.Internal.Once.<id>`), node visit counts (`$Yarn.Internal.Visiting.<node>`), saliency view counts (`$Yarn.Internal.Content.ViewCount.<contentId>`). Keys are bare names (no `$` for authored variables); generated keys carry the sigil as part of the reserved namespace.

**What serializes**: exactly `entries()` — plain name/value pairs whose values are Yarn runtime values (number/string/bool; JSON-safe). The documented persistence contract (variableStorage.ts module doc): "the host mirrors `entries()` to its store (save) and re-injects a pre-populated storage into a fresh `Dialogue` (load). Declare-default seeding skips names the injected storage already holds, so restored values survive construction." So a per-HTTP-request snapshot/restore is: `JSON.stringify([...storage.entries()])` → later `new InMemoryVariableStorage()` + `set` each pair → construct with `variableStorage`.

**What does NOT serialize**: the VM's execution position. `src/runtime/vm.ts` holds `ip`, `stack`, `returnStack`, `pendingOptions`, `accumulatedOptions`, `nodeTitle`, `queuedEvents`, saliency candidates — all private, no snapshot API, deliberately outside storage. A fresh `Dialogue` over restored storage starts (via `setNode(title)`) at the **top of that node**, replaying any content the previous instance had already delivered *within the current node*. Delivered-line history, once-state, and visit counts from earlier nodes survive (they're in storage); the partial progress inside the node being executed when the snapshot was taken does not. `Dialogue.getVariables()` is the human-meaningful view (generated keys filtered out); `entries()` is the full fidelity one.

## 3. Node project loader (`yarnspinner-typescript/node`)

Source: `src/compile/nodeProjectFs.ts`, `src/compile/yarnProject.ts`, `src/compile/compileSource.ts`, `src/compile/program.ts`.

### API

The root `package.json` exports a `./node` subpath precisely so browser bundles never see `node:fs`:

```json
"./node": {
  "import":   { "types": "./dist/compile/nodeProjectFs.d.ts",   "default": "./dist/compile/nodeProjectFs.js" },
  "require":  { "types": "./dist/compile/nodeProjectFs.d.cts",  "default": "./dist/compile/nodeProjectFs.cjs" }
}
```

```ts
export function loadYarnProject(projectFilePath: string, compileOpts: CompileOptions = {}): LoadProjectResult;
export function nodeProjectFs(projectDir: string): YarnProjectFileSystem;  // the default fs provider
// Also public from the main entry (fs-free core):
export function loadProject(opts: LoadProjectOptions): LoadProjectResult;  // injected filesystem variant
export function listSources(opts: LoadProjectOptions): SourceList;
export interface YarnProjectFileSystem { listFiles(): string[]; read(path: string): string | null; }
```

**Inputs**: a path to a `.yarnproject` file (upstream format v4, legacy v2 accepted, JSONC comments/trailing commas tolerated). It resolves `sourceFiles`/`excludeFiles` globs against the project directory, reads the matched `.yarn` files, and compiles them as one job. The lower-level `loadProject` accepts `{ project: string | object, fileSystem, projectFile? }` — so a custom store (DB, CMS) can implement `YarnProjectFileSystem` and skip the disk entirely.

**Output**: `LoadProjectResult extends CompileResult` with `project` and `sources` added:

```ts
export interface CompileResult {
  program: Program | null;              // the runtime artifact (null when parse failed / mode stops early)
  stringTable: StringTable | null;
  declarations: VariableDeclaration[];
  diagnostics: Diagnostic[];
  fileTags: Record<string, string[]>;
  containsImplicitStringTags: boolean;
  userDefinedTypes: EnumType[];
  projectDebugInfo: ProjectDebugInfo | null;
}
```

`Program` is **a versioned JSON artifact — plain serializable data, not a class graph**:

```ts
export const programLanguageVersion = 2;
export type Program = {
  languageVersion: number;
  enums: Record<string, Record<string, number | string>>;
  nodes: Record<string, ProgramNode | ProgramNodeGroup>;
  initialValues: Record<string, Instruction[]>;
  smartVariables: Record<string, Instruction[]>;
};
```

So `program` hands straight to `new Dialogue(program, …)` and survives `JSON.stringify`/`structuredClone` across any serialization boundary (API route → client, build step → file). `loadLocalisations` (main entry) reads the strings CSVs into `baseTable`/`translations` for `createProjectTextProvider`.

### Runtime cost and load timing

- **Fully synchronous** (`readFileSync`/`readdirSync` walk; skip list `node_modules`/`.git`), no async anywhere in the load path — fine at server startup or inside a Next.js module-level singleton; inside a request handler it blocks the event loop for the compile duration (small fixture: negligible; measure if content grows).
- Compilation is pure computation (parser + type-check + lowering); the loader is collect-don't-throw — every problem is a `Diagnostic` (YP0001–YP0008 for project-file issues, YSxxxx for language issues), never an exception unless `strict: true`.
- **Can it load `.yarn` at request time or startup?** Yes — both. `docs/direct-import.md` documents exactly this as the "SSR load path": *"Server-rendered hosts that compile once per deploy (Next.js server components, SvelteKit +page.server.ts) can skip bundler integration entirely: call `loadYarnProject("path/to/project.yarnproject")` from `yarnspinner-typescript/node` at request/build time and pass the program across the serialization boundary."*
- The main entry is browser-safe: `src/index.ts` never imports the node module (it lives only behind the `./node` subpath), so the same package serves client bundles and server routes.

## 4. `yarnspinner-vite-plugin`

Source: `packages/vite-plugin/src/index.ts`, `compileModule.ts`, `compileProjectModule.ts`, `client.d.ts`; `docs/direct-import.md`.

### What it emits

**No virtual module ids** — real-file ids compiled in place (the mdx/svelte precedent); a `load` hook answers them:

- `import story from "./story.yarn"` → ESM text whose **default export is `JSON.stringify(program)`** plus tree-shakeable named exports `stringTable`, `containsImplicitStringTags`, `fileTags`.
- `import source from "./story.yarn?raw"` → the raw source string.
- `import project from "./project.yarnproject"` → one default export, pure data: `{ program, projectName, baseLanguage, baseTable, translations, assets, diagnostics }` (shaped for `createProjectTextProvider`).
- With the `project` option pinning a `.yarnproject`, `.yarn` imports emit the full load result instead of the bare program (documented deviation in `client.d.ts`).

The emitted code is literally (from `compileModule.ts`):

```ts
const code =
  `// ${filename} — compiled at build time by yarnspinner-vite-plugin\n` +
  `export default ${JSON.stringify(program)};\n` +
  `export const stringTable = ${JSON.stringify(stringTable ?? {})};\n` +
  `export const containsImplicitStringTags = ${containsImplicitStringTags};\n` +
  `export const fileTags = ${JSON.stringify(fileTags)};\n`;
```

Error-severity diagnostics fail the build as a RollupError (`{ message, id, loc: {file,line,column}, frame }` — clickable in terminal/overlay); warnings ride the bundler's warn channel. Dev edits to `.yarn`/`.yarnproject` trigger full reload.

### Options

```ts
yarnSpinnerVitePlugin({
  project?: string;                        // pin a .yarnproject as the compilation context (no upward discovery)
  definitions?: Array<string | YslsDefinitions>;  // .ysls.json → compile-time Library signatures
  compilerOptions?: { diagnosticsSeverity?: Record<string, DiagnosticSeverity> };
  diagnosticsSeverity?: Record<string, DiagnosticSeverity>;
  include?: string | RegExp | Array<string | RegExp>;   // unanchored globs layered over extension matching
  exclude?: string | RegExp | Array<string | RegExp>;
});
```

### Reusing the compile step under Next.js

The plugin's compile steps are deliberately **bundler-agnostic and exported from its main entry** (no Vite types cross those modules):

```ts
export function compileYarnModule(source: string, filename: string, opts?: CompileYarnOptions): CompiledYarnModule;
export function compileYarnProjectModule(projectFilePath: string, opts?: CompileYarnOptions, displayName?: string): CompiledYarnModule;
export interface CompiledYarnModule { code: string; errors: Diagnostic[]; warnings: Diagnostic[]; }
```

`docs/direct-import.md` states the Next.js story outright: *"a loader covers **webpack mode**; **Turbopack** has no loader API yet — use `webpack: (config) => { … }` config escape or, until then, the SSR path below."* A webpack loader is a thin shim: call `compileYarnModule`, map `errors` → `this.emitError`, `warnings` → `this.warn`, return `code`.

**Standalone compile script** (the third option in ticket 04's question): trivially supported — the same functions run in a plain Node script (`node scripts/compile-yarn.mjs`) and you write `JSON.stringify(program)` (or the whole load result) to a `.json`/`.ts` file consumed at build or runtime. That is byte-equivalent to what the plugin emits, because the plugin itself just `JSON.stringify`s the compiler's `Program`. Equally, calling `loadYarnProject()`/`compileSource()` from `yarnspinner-typescript` directly skips the plugin package altogether. The doc's decision rule: *plugin when content is baked into client bundles and versioned with them; SSR path when content is deployment data (CMS-updatable without rebuild) or the bundler has no loader seam.*

## 5. Versions, peers, module formats, license

| | `yarnspinner-typescript` | `yarnspinner-vite-plugin` |
|---|---|---|
| Version (local, `package.json`) | 1.0.0 | 1.0.0 |
| On npm? | **No — 404** (2026-09-09) | **No — 404** (2026-09-09) |
| License | CC0-1.0 | CC0-1.0 |
| Module format | `"type": "module"`, **dual**: `exports["."]` has `import` → `dist/index.js` and `require` → `dist/index.cjs`; `./node` subpath dual likewise; `.d.ts`/`.d.cts` types ship in-package | `"type": "module"`, **ESM-only**: `exports["."]` has only `import`; `./client` is types-only |
| Runtime dependencies | **None** (devDependencies only) | none of its own |
| Peer dependencies | — | `vite: ^5.0.0 || ^6.0.0 || ^7.0.0`, `yarnspinner-typescript: ^1.0.0` |
| `engines` | none declared | none declared |
| Build status (local) | `dist/` built (ESM + CJS + types) | `dist/` built |

Upstream parity target: Yarn Spinner 3.2.2 (MIT; conformance corpus vendored at that tag — `CITATION.cff`). Program artifact is **not** compatible with upstream's protobuf `Program`; behavior is the contract. Peer note for our stack: Next.js 15 uses Turbopack/webpack, not Vite — the plugin's `vite` peer dep is irrelevant to us unless we use its bundler-agnostic compile functions directly (they don't require Vite at runtime, but the package's peer dep will make npm complain unless `--legacy-peer-deps`/`peerDependenciesMeta` handling or a direct core-package-only approach is used).

## Implications for ticket 04 (chat wrapper prototype)

1. **Install story is the first decision.** Nothing to `npm install` from the registry: use `file:../yarnspinner-ts` (dist is built; add a prebuild/dev dependency on the sibling's `npm run build:all`), `npm pack`, or get the repo pushed + published. This also means the user should decide whether public publication happens before the prototype (it changes the Docker/CI story).
2. **Server vs client is a genuine choice — both work.** Main entry is browser-safe and dual-format (CJS for webpack, ESM for Turbopack); the runtime never touches fs; program + string table are plain JSON. Server-side gives the session-state story below for free; client-side needs the vite plugin (or precompiled JSON) to get content into the bundle.
3. **`.yarn` → build under Next.js, three documented paths**: (a) webpack-mode loader shim over `compileYarnModule` (works only in webpack mode; Turbopack has no loader API); (b) **SSR path** — `loadYarnProject()` once at startup in a module-level singleton (the doc's recommended alternative when the bundler has no loader seam, and the simplest for a prototype whose content is deployment data); (c) standalone build script emitting program JSON imported as a module. For a Next.js prototype on Turbopack, (b) is the zero-friction route.
4. **Session state shapes the wrapper more than runtime location does.** A chat turn ends at a stopping point; an `options` stopping point leaves the Dialogue mid-node awaiting `selectOption`. VM position does **not** serialize — only `VariableStorage.entries()` does. So either (a) keep one `Dialogue` per session in server memory (module-level `Map`, fine for a local art piece), or (b) snapshot/restore per request and accept node-top restart, which pushes the yarn script toward *one node per conversational turn*. The `runUntilStopped`/`Transcript` helpers map directly onto a per-turn request/response: pull → lines+options or complete → serialize transcript chunk to the client.
5. **Errors are diagnostics, and the plugin's error shape is build-time only.** A request-time wrapper should thread `logError` and treat empty `continue()` batches + `isWaitingForOptionSelection`/`isComplete` as the flow signals (or just use `pullUntilStopped`, which guards both).
