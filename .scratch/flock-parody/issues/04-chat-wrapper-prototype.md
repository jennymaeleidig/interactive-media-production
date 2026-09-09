Status: open
Type: prototype
Blocked by: 02, 06, 07

## Question

How does the cloned chat widget bind to yarnspinner-ts? Build the cheapest concrete thing that answers it: a stub chat window matching the Qualified UX (from ticket 02) wired to a `Dialogue` instance through a Next.js API route, driven by a minimal throwaway Yarn fixture — real script content is the user's future effort.

Decisions the prototype must pin:

- **Where the runtime lives**: server-side API route (per-session state — restore via injected, serialized `VariableStorage`) vs client-side bundle; and the resulting message API shape.
- **How `.yarn` content enters the build**: the repo's yarnspinner-vite-plugin does not plug into Next.js natively — the realistic options are the Node project loader (`yarnspinner-typescript/node`) at runtime, or a build-time compile step emitting program JSON. The user's instinct was "use the vite plugin"; surface what that actually takes in Next.js and pick.
- **The wrapper's interface**: what the cloned widget calls, what comes back (`LineEvent`/`OptionsEvent` → chat bubbles/quick replies), how variables and session state persist across requests.

Link the prototype as an asset; record the interface decisions in the answer.
