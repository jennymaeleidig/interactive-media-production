Status: open
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
