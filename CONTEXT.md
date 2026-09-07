# CONTEXT.md

Glossary for this repo. Terms are added as they resolve in conversation; no implementation detail lives here.

## Terms

**Plume** — the satirical surveillance vendor this project imitates. A parody brand: bird-adjacent naming, deadpan register, original marks and copy. Exists for commentary on ALPR surveillance; must never be mistaken for, or used to impersonate, a real vendor.

**PlumeOS** — Plume's platform product, the analog of a real-time crime center offered as "one map" software. The fidelity target of the vendor-mimicry prototype. Tagline: "Everything, already together."

**Satire skin** — the design-and-voice treatment that reproduces a real vendor's design language and copy register for the parody, while reusing nothing ownable (marks, photography, copy, claims). Governed by the `plume-design-language` and `corporate-jargon-voice` skills.

**Plume AI Sales Assistant** — the site-wide chat widget imitating the subject vendor's AI sales assistant: a floating bubble opening a choices-only conversation panel (no free-text input). Its dialogue is Yarn Spinner 3.x content, compiled at build time and run by the owner's local yarnspinner-ts library.

**Nav take-over** — the mobile navigation pattern: a hamburger in the floating header opens a full-screen take-over listing the site's pages, in the subject vendor's design language (a two-tone ground — the header strip reads one tone lighter than the take-over body — with hairline row dividers and a full-width pill CTA). Flat list, not accordions — the link graph is small. The Plume AI Sales Assistant always layers above it. _Avoid_: "mobile menu".
