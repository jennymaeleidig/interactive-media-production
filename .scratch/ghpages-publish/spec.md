# Effort: publish the Recreation as a static GitHub Pages site

The piece is a Next.js app serving a static tree (`served/`). The user's goal is
to publish that tree as a GitHub Pages site, so the effort is about the gap
between "works locally" and "publishable": the published-site size limit, the
URL shape the build emits, and the attribution a reproduction of someone else's
site requires.

## Constraints already established

- **1 GB published-site limit** (documented Pages limit). The tree measured
  2.36 GB: 1,843.8 MB of HTML of which 1,642 MB was `<style>` bodies — the same
  stylesheets re-encoded on all 1,181 pages. Resolved by
  [01](issues/01-bodies-ship-as-files.md) → ADR 0003; the tree is now 660 MB.
- **Root-absolute references.** Every served reference is `/assets/...` or an
  absolute route, so the site must be published at a site root (an
  `<owner>.github.io` repository or a custom domain), never at `/<repo>/`.
- **Extension-less URLs.** The build emits `a/b.html` and the app answers `/a/b`.
  Whether Pages serves `/a/b` from `a/b.html` is undocumented and unverified, so
  it gets a smoke test on the first deploy; the fallback is directory-style
  `a/b/index.html` output, which is a pure rename because references are
  root-absolute.
- **Non-affiliation disclaimer** (Pages' acceptable-use rule for copies of an
  existing website): the user will add the banner as its own change.
- **No user data.** The chat mimic collects nothing and posts only to the local
  mock route; the captured analytics/consent machinery is stripped by the build
  and the strip audit fails the build if any returns.

## Not yet decided

- Where the tree is published from: a single-commit orphan `gh-pages` branch
  force-pushed per deploy (so git history does not accumulate ~660 MB per
  publish) versus a GitHub Actions workflow that runs the pipeline and the
  serving check first.
- Whether the 254 MB of legacy raster assets (PNG/JPG/GIF) get re-encoded to
  avif/webp — a visible-fidelity decision that needs its own ADR, and one that
  is not required: the tree fits with them.
