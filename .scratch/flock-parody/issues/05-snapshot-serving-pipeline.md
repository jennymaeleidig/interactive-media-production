Status: open
Type: prototype
Blocked by: 03

## Question

What is the repeatable workflow from Capture to Next.js route that hits the fidelity bar? Prototype it once on the hardest single page — the homepage (split-text animations, hero video, the chat widget mount point):

- How a single-file capture decomposes into routes, components, and self-hosted verbatim assets (CSS extraction strategy, asset localization, font hosting).
- How internal hrefs rewrite to Recreation routes while external links stay untouched — the link policy mechanized.
- What the automated screenshot diff looks like in practice (capture vs rebuild at 2–3 viewports) and where it runs (herdr pane or Docker — headless Chromium cannot run under the main sandbox).

Product: the extraction workflow, proven once, that the spec describes as the build method for every page.
