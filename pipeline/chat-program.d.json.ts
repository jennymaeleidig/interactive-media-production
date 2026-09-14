// The compiled Yarn program's type, beside the generated JSON it describes.
//
// `chat-program.json` is built by `pipeline/build-chat-runtime.mjs` from
// `dialogue/flock.yarn`; `resolveJsonModule` would infer its over-literal JSON
// shape, which is not the runtime's `Program`. TypeScript resolves
// `./chat-program.json` to this declaration (`foo.d.json.ts`), so
// `pipeline/chat-engine.mjs` — under `checkJs` — imports the loader's own type
// without writing a cast into bytes the bundle ships.
//
// SPDX-License-Identifier: CC0-1.0
import type { Program } from 'yarnspinner-typescript';

declare const program: Program;
export default program;
