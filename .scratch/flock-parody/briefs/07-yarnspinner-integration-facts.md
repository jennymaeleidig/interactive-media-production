# Brief: yarnspinner-ts integration facts (ticket 07)

You are resolving a wayfinding research ticket for the flock-parody effort.

**Ticket**: `.scratch/flock-parody/issues/07-yarnspinner-integration-facts.md` — read it first; it lists the five fact areas to pin (Dialogue runtime API, VariableStorage serialization, Node project loader, vite plugin output, versions/peers).

**Sources**:

- Local sibling repo: `/Users/jennyleidig/Documents/projects/interactive-media/yarnspinner-ts` — bash may be sandbox-fenced for paths outside this repo; if so, use pi's in-process `read`/`find`/`grep` tools (they reach it, possibly with a permission prompt), or fall back to the public GitHub/npm sources.
- Public: the user's yarnspinner-ts repos/packages on GitHub and npm (search `yarnspinner-typescript`, `yarnspinner-vite-plugin`).

**Deliverable convention**: full findings in `.scratch/flock-parody/research/07-yarnspinner-integration-facts.md` (each fact with file/version references and code excerpts of the exact signatures); short-gist `## Answer` on the ticket linking to it; `Status: resolved`; one Decisions-so-far line on `.scratch/flock-parody/map.md`.

**Why it matters**: ticket 04 (chat wrapper prototype) must decide where the runtime lives (Next.js API route vs client bundle) and how `.yarn` content enters the build (vite plugin vs node loader vs build-time compile to program JSON). Your facts are the raw material for that decision — accuracy of exact signatures matters more than recommendation, but a short "implications for ticket 04" section is welcome.

**Boundary**: research only — read and document; do not build anything or modify the sibling repo.
