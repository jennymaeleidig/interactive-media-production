# 03: Establish the user-site publishing repository

**What to build:** The repository that owns the GitHub Pages user site exists
and is configured to publish with GitHub Actions, so this effort's deploy lands
at the bare `<owner>.github.io` host rather than a project subpath (which would
404 every root-absolute asset). The porkbun custom domain is deliberately **not**
attached yet.

**Blocked by:** None (can start immediately). **Alternative to 07** — 07 was
taken (2026-09-14), so this ticket is closed rather than built.

**Status:** resolved

> Not taken: the choice made was 07 — keep this repository's name and attach the
> porkbun custom domain to it. This ticket existed only as the user-site
> alternative (rename to `<owner>.github.io`, or add it as a second repo).

- [ ] A `<owner>.github.io` repository exists, and its Pages source is set to
      GitHub Actions.
- [ ] If the rename was chosen, the git remote and any existing checkout still
      resolve, and the old project URL redirects.
- [ ] The site's root URL is the bare host, with no `/<repo>/` prefix.
- [ ] No custom domain is attached; attaching the porkbun domain is left for
      later.

## Comments

2026-09-14 — Resolved as **not taken**. The hosting choice went to 07: this
repository keeps its name and reaches a URL root by attaching the porkbun custom
domain to it. None of the criteria above were carried out; they are left
unchecked as the record of what the road not taken would have required. The
user-site path stays the fallback if the custom-domain path is ever abandoned.
