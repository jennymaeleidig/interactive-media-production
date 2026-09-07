# CODING_STANDARDS.md

Reference for agents writing or editing code in this repo. The stack: SvelteKit 2, Svelte 5 (runes mode is forced in `vite.config.ts`), TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`), Prettier. Formatting config lives in `.prettierrc`; scripts live in `package.json` — this file covers what the environment cannot.

## Svelte 5: runes only

Legacy syntax fails here — runes mode is enforced project-wide (except `node_modules`).

- State: `$state()`. Derivations: `$derived()` or `$derived.by()`. Side effects: `$effect()`.
- Props: destructure from `$props()` with a TypeScript type — `let { data, children }: Props = $props()`.
- Events: standard DOM attributes — `onclick={handler}`, never `on:click`.
- Content projection: snippets — `{@render children()}`, never `<slot />`.
- Prefer `$derived` over `$effect`: compute values, do not sync them. An `$effect` that writes state another `$effect` reads is a bug in disguise.
- `$effect` is for the outside world only (DOM, timers, analytics, subscriptions). If the output is state another component renders, it belongs in `$derived` or the load function.

## Shared state

- Component-local: plain runes in the component.
- Shared client state: a `.svelte.ts` module in `src/lib/state/` exporting rune-based objects or classes.
- No stores (`writable`/`readable`) and no globals on `window`.
- Data a route needs comes from its `load` function, not shared state — state is for cross-route client concerns only.

## SvelteKit conventions

- Route files: `+page.svelte`, `+page.ts`, `+page.server.ts`, `+layout.svelte`, `+layout.ts`, `+server.ts`, `+error.svelte`. Route directories lowercase, hyphenated.
- `+page.ts` (universal) by default; `+page.server.ts` only when the work needs secrets, the database, or server-only APIs.
- `load` returns serializable data; type it through `./$types` — `import type { PageProps } from './$types'`. Never restate inferred types by hand.
- Mutations go through form actions (`+page.server.ts` → `export const actions`) or `+server.ts` endpoints; prefer progressive enhancement with `use:enhance`.
- Server-only modules end in `.server.ts`. Private env through `$env/static/private` or `$env/dynamic/private` — importing either into client-run code is a build error and a real leak; keep the boundary honest by keeping server logic in `.server.ts` files.
- Shared code lives in `src/lib`, imported via `$lib`. Components: `src/lib/components/` in PascalCase; helpers: camelCase modules colocated with the feature that owns them until a second feature needs them.

## TypeScript

- No `any`, no `as` casts to silence the compiler — narrow with type guards or fix the type.
- Prefer inference and `satisfies` over explicit annotations where the compiler already knows.
- Public API shapes (component props, load returns, lib exports) get explicit types; internal locals get inference.

## Tailwind v4

- `src/app.css` is the single stylesheet entry — `@import 'tailwindcss';` plus project tokens in `@theme`. Components never define their own CSS except for genuinely un-representable cases (keyframes, exotic selectors), and then via a scoped `<style>` block with a comment saying why.
- Styling is utility classes in markup. `@apply` only in `app.css` for a repeated multi-utility pattern with a real name.
- No inline `style` attributes for design values — those belong in `@theme` tokens so they stay consistent.
- z-index is for systemic layers only, never per-component escalation. Consume the `--z-index-*` tokens from `app.css` `@theme` via `z-(--z-index-*)`; no bare `z-<number>` in components. New overlapping layering goes through a new token there, documented in that comment block.
- Class order and wrapping are Prettier's job (`prettier-plugin-tailwindcss`); never hand-sort.

## Accessibility

- Semantic HTML first: real `<button>`, `<a>`, `<label>`, landmarks — a `div` with a click handler is a defect.
- Interactive components follow the [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/) pattern for their widget, including the keyboard contract.
- All images get `alt`; decorative images get `alt=""`. Form controls are labelled.
- Svelte's compiler catches some a11y warnings — treat them as errors, not noise.

## Before finishing any change

1. `npm run format` — Prettier is the authority on formatting; apply it, do not hand-format.
2. `npm run check` — zero errors and zero warnings.
3. `npm run build` — passes.
4. `npm run test` — passes when the change touches logic covered by tests (`*.test.ts` beside the code).

All pass, or the change is not done.
