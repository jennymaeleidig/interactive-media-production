# Publishing the Recreation to GitHub Pages

## Problem Statement

The Recreation exists only as a Next.js app that has to run on a machine. To see
it today you clone a ~1.7 GB repository, install a toolchain that includes an
absolute local `file:` dependency, and run a dev server. There is **no public
URL**, so the piece cannot be seen by anyone who has not done all of that, and
it cannot be shared or linked.

GitHub can host the frozen tree for free, but a naive publish breaks the
Recreation rather than revealing it:

- Every reference the tree carries is **root-absolute** (`/assets/<sha16>.<ext>`,
  `/products/flock-os`), so a Pages project URL
  (`https://<owner>.github.io/<repo>/`) 404s every asset and most links.
- Every page except the homepage exists **only as `<path>.html`**, and internal
  links are extensionless and often unquoted.
- 67 legacy URLs were `301`s emitted by the server; a static host has no
  redirect table.
- Unknown paths collapse to one `404.html` instead of the served tree's own
  `Not found` body.
- The **Chat mimic** and the forms are backed by server routes, which will not
  exist on a static host.
- A word-for-word reproduction of someone else's site needs a **visible
  non-affiliation disclaimer**, and it is not in the tree.

## Solution

A reproducible publish step **materializes** the committed `served/` tree into a
static artifact and an Actions workflow deploys that artifact to a GitHub Pages
site at a **URL root** — the bare `<owner>.github.io` host, with the maintainer's
porkbun domain attachable later as a settings change.

The materialization never edits `served/`. It copies the tree, writes a
route-path copy of every page so extensionless routes resolve as real files, turns
the 67 legacy redirects into client-side redirect pages, and writes one
`404.html` carrying the serving layer's own `Not found` body. The workflow runs
the repository's existing typecheck, test and build before deploying, so a broken
tree cannot ship. A separate hand-run smoke check confirms the live site still
answers 200 with byte-identical bytes and that the redirect artifacts land.

The result: the Recreation is a URL, byte-for-byte the tree the repo serves, with
its limits and degradations recorded rather than discovered.

## User Stories

1. As a visitor, I want to open the Recreation at a public URL, so that I can
   experience it without cloning a repository or installing anything.
2. As a visitor, I want every page to render with its intended styling, images,
   fonts and media, so that the Recreation looks like the Capture it reproduces.
3. As a visitor, I want internal links to take me to the page they name, so that
   I can browse the whole site from any entry point.
4. As a visitor following an old URL that upstream redirected, I want to land on
   the same destination, so that saved and shared links still work.
5. As a visitor who mistypes or follows a dead link, I want to see the site's own
   not-found words, so that I know the dead end is upstream's and not a hosting
   failure.
6. As a visitor arriving from a search engine or a shared link, I want to land on
   the page I asked for and not a download or a directory listing, so that the
   first impression is the piece.
7. As a visitor on a slow connection, I want the published site to stay no larger
   than it has to be within fidelity, so that pages arrive.
8. As a visitor with JavaScript disabled, I want the captured static end-state,
   so that the reduced-motion/no-JS promise of the Recreation survives publishing.
9. As a visitor who opens the chat, I want to not be misled into thinking a live
   assistant is answering, so that the mimic's nature is clear.
10. As a visitor who fills in a form, I want to be told submissions are disabled,
    so that I do not believe my message was sent.
11. As the person whose site is reproduced, I want a visible non-affiliation
    disclaimer, so that I am not represented as endorsing this piece.
12. As the maintainer, I want one reproducible publish command, so that releasing
    is not a manual file dance I have to re-derive each time.
13. As the maintainer, I want the publish to read the committed `served/` tree,
    so that the published site cannot drift from what the repo serves.
14. As the maintainer, I want the publish to never edit `served/`, so that the
    Frozen snapshot and byte-identity guarantees survive publishing.
15. As the maintainer, I want the publish to fail loudly if the artifact would
    exceed the host's size limit, so that I learn before a failed deploy.
16. As the maintainer, I want the publish to fail if a generated artifact would
    shadow a real served page, so that a redirect or copy cannot clobber content.
17. As the maintainer, I want the site to live at a URL root from the first
    publish, so that no publish-time prefix rewrite is needed.
18. As the maintainer, I want to attach my porkbun custom domain without
    changing the publish, so that the domain is a settings change, not a
    re-architecture.
19. As the maintainer choosing the user-site path, I want the old `github.io`
    URLs to keep working after the custom domain is attached, so that
    already-shared links do not rot.
20. As the maintainer, I want the workflow to run typecheck, the full test suite
    and the build before deploying, so that a broken tree cannot reach the public
    URL.
21. As the maintainer, I want the published site to be reachable only when those
    checks pass, so that the public URL is never the debugging surface.
22. As the maintainer, I want a hand-run post-deploy check, so that I can confirm
    the live site still matches the tree.
23. As the maintainer, I want that check to compare live bytes against the served
    files, so that a publish which altered bytes is caught even though the
    in-repo byte-identity check is self-referential.
24. As the maintainer, I want the redirect artifacts' real status recorded, so
    that the 200-vs-301 fidelity gap is a known fact rather than a surprise.
25. As a future maintainer, I want the publish materializer to have no npm
    dependencies, so that it runs even when the repository's toolchain is broken.
26. As a future maintainer, I want the route-mapping logic to be a pure, tested
    core with a thin filesystem edge, so that I can change the artifact shape
    without a browser or a live host.
27. As a future maintainer, I want the redirect set to come from the committed
    manifest, so that changing a redirect is a data change, not a code change.
28. As the upstream watch, I want publishing to leave `served/` untouched, so
    that my digests stay comparable across a publish.
29. As a reviewer of the art piece, I want the published bytes to equal the served
    bytes, so that what I reviewed is what shipped.
30. As the site's captured content-security policy, I want it to carry into the
    published site unchanged, so that no new network behavior appears.
31. As a search engine crawler, I want the redirect pages to declare themselves
    non-canonical, so that redirect plumbing does not pollute results for the
    real pages.
32. As the owner of the piece, I want the first deploy to settle whether the
    Actions build route resolves extensionless paths the way the observed legacy
    route does, so that an undocumented assumption becomes a recorded fact.
33. As the owner of the piece, I want the repository to stay free of a committed
    build-output copy, so that cloning remains as cheap as it is today.
34. As the owner of the piece, I want the published site to be a faithful
    end-state, so that the Parody layer effort starts from a true baseline.
35. As the owner of the piece, I want the disclaimer and the forms notice to be
    faithful served-byte changes rather than host-injected edits, so that the
    published bytes and the tree remain one artifact.
36. As the maintainer who does not want to rename the repository or add a second
    one, I want to put the site on my porkbun domain from the first publish, so
    that this repository stays the project and still gets a working URL root.

## Implementation Decisions

1. **Publish from an Actions artifact workflow, not a branch source.** A branch
   source would re-commit the ~660 MB tree on every publish and accumulate it in
   git history; an Actions deploy uploads the materialized tree as one artifact
   and changes no committed file. Jekyll never runs on an Actions deploy, so no
   `.nojekyll` is needed. The binding limits are the 1 GB published-site cap, a
   hard 10-minute deploy timeout that cannot be raised, and a 100 GB/month
   bandwidth soft limit.

2. **The publish materializes; it never edits `served/`.** Copying a served file
   to a second path and adding new files to the output are allowed (the serving
   check derives its page set from the build record, not the filesystem).
   Rewriting the root-absolute prefixes in place and inlining the disclaimer into
   served bytes are forbidden: they mutate frozen bytes the build record no
   longer describes, and the self-referential byte-identity check would not catch
   it.

3. **The artifact is the whole tree plus a route-path copy of every page.** The
   output carries `served/` verbatim *and* a copy of each non-root page at
   `<route>/index.html`. `/<route>` then resolves from the byte-identical `.html`
   sibling by GitHub Pages' observed `.html`-appending rule, and if that
   undocumented rule ever did not hold it falls back to a directory
   `301` → `/<route>/` → `index.html`. Correctness never depends on the
   undocumented behavior; only the 200-versus-301 hop does. Measured cost:
   +1,180 files / 149,055,101 bytes, projecting the published site to
   831,366,416 bytes (~17% under the 1 GB cap) and ~5,714 files. The `.html`
   siblings stay — they are what the appending rule serves and what byte-identity
   is measured against.

4. **Do not publish the tree verbatim and gamble on `.html` appending.** That
   costs zero added bytes and returns 200 with exact bytes, but the entire site
   404s except the homepage if the rule is absent on this build route. Do not
   commit literal extensionless files either: their content type is unverified
   and risks a download instead of a rendered page.

5. **Redirects become client-side redirect pages, and the fidelity gap is
   recorded.** Each of the 67 manifest sources gets a generated page at its own
   path carrying a canonical link, a `meta http-equiv=refresh`, a JS `location=`
   fallback, a `robots noindex` directive and a visible fallback link. Pages
   answers 200, never 301, so the true status is unreproducible on a static host;
   that gap is a recorded fact, not a defect to chase.

6. **One `404.html` carries the serving layer's own body.** Its content is the
   exact `Not found` text the Next host returns, so dead collection roots,
   auth-gated stubs, dropped scaffold pages and dead links land on the same words
   as they do locally. It adds no page copy.

7. **Hosting must be at a URL root; two paths get there, and exactly one is
   taken.** The project-site URL `https://<owner>.github.io/<repo>/` 404s every
   root-absolute asset, so either (a) a `<owner>.github.io` **user-site
   repository** serves the bare host — the maintainer's default URL, with the
   porkbun domain attachable later — or (b) this project repository keeps its
   name and the **porkbun custom domain is attached now**, which replaces the
   URL root so the `/<repo>/` prefix disappears. Attaching a custom domain is a
   repository setting either way; a `CNAME` file alone does not attach it for an
   Actions deploy. A custom domain on a *different* repository's user site is
   not a root-hosting option: it keeps the `/<repo>/` prefix. A publish-time
   prefix rewrite is ruled out — it would break the guarantee that published
   bytes equal served bytes. **Chosen 2026-09-14: (b)** — this repository keeps
   its name; the user-site path stays the fallback.

8. **The publish step is dependency-free; the workflow can now install and
   gate.** The publish materializer only reads and copies files, so it is plain
   Node ESM with a pure routing/mapping core plus a thin filesystem edge, in the
   same idiom as the repository's other rule modules. Separately, the absolute
   `file:` yarnspinner pin is replaced by the published npm package, which is
   what allows a runner to `npm ci` and the workflow to run the existing
   typecheck, test and build before materializing. The workflow is the
   repository's only CI.

9. **The Chat mimic stays mounted; its degradation is documented.** The widget
   returns silently when its POST is not OK, so against a static 404 it opens,
   accepts input and no-ops with no visible error. Disabling it would edit served
   bytes or add copy, so the gap is recorded instead.

10. **The forms break visibly and are disclosed, not fixed.** 66 pages POST
    natively to a form endpoint; statically the browser lands on the host's error
    page with no thank-you and a lost submission. A notice is added later.

11. **The disclaimer and the forms notice are deliberate, reviewed tree
    migrations.** They are visitor-visible copy the Capture did not carry, so
    they belong in `served/` as their own committed change under the tree's normal
    rule, not as publish-time injection. The maintainer adds them after the first
    publish.

12. **The serving check is not the post-deploy gate.** It accepts a base URL, but
    it asserts real 301s (the redirect artifacts answer 200) and its byte-identity
    compares the deployed response to the local file. The post-deploy check is a
    new hand-run smoke pass over a sampled route set: 200 status, byte-identity
    against the tree, asset content type, and a reachable redirect target.

13. **The seams are the pure mapping core and the artifact, not the host.** The
    materializer's routing, generated bytes and budget math are tested without a
    filesystem or network; the artifact shape is tested over a fixture tree; the
    live site is only ever touched by the smoke check.

## Testing Decisions

A good test here asserts **external behavior**: the artifact a caller gets, and
the bytes a browser would receive — never the internal structure of the
materializer. Prior art is the repository's split between pure cores
(unit-tested in isolation) and thin edges, and the serving check's byte-identity
assertion.

- **The pure mapping core** — route → artifact-path mapping, the generated
  redirect page's bytes, the `404.html` bytes, and the budget arithmetic. Tested
  in isolation from a fixture listing plus a stubbed reader, in the style of the
  existing pure-core route tests.
- **The artifact shape** — over a small fixture tree, the materialization
  produces exactly the expected output file set and bytes: the copied tree, one
  route-path copy per page, one redirect page per manifest entry, and the
  `404.html`; and it refuses a would-be collision with a real page or an
  over-budget artifact.
- **The pre-deploy gate** — the workflow runs the repository's existing
  typecheck, full test suite and production build before it materializes or
  deploys. No new test surface; the existing suite is the subject.
- **The post-deploy smoke** — a hand-run script against the deployed host:
  sampled routes answer 200, their bodies equal the tree's bytes, assets answer
  with the content type their extension declares, and a redirect source reaches
  its target. This is the only seam that touches the network.
- **The first-deploy fact** — whether the Actions build route resolves
  extensionless paths the way the observed legacy route does. Settled by the
  smoke pass and recorded; it is not a test that can run before a deploy exists.

## Out of Scope

- Re-encoding the 254 MB of legacy raster assets to avif/webp. It is a
  visible-fidelity decision that needs its own ADR, and it is not required — the
  tree fits.
- Attaching the porkbun custom domain now. It is a later repository setting, not
  a publish step.
- The non-affiliation disclaimer and the forms-disabled notice. They are later,
  reviewed tree migrations (though their placement and method are decided here).
- Making the Chat mimic or the forms work on a static host.
- A pixel gate. The retired one was self-versus-self and could not see a bad
  tree, which is why byte-identity is the guarantee.
- Any change to the Parody layer, the story-hook seam, or the dialogue script.

## Further Notes

- **Research record.** The findings behind this spec are committed beside it:
  a primary-source study of GitHub Pages behavior (deployment mechanics, limits,
  URL-resolution semantics, 404 and redirect conventions, custom domains) and a
  measured inventory of the served tree (route-to-file mapping, reference census,
  server-dependent endpoints, byte-fidelity constraints, size economics).
- **The key unknown.** GitHub Pages' URL resolution was observed on
  branch-published origins; whether the Actions build route resolves identically
  is unconfirmed. Decision 3 is what makes that unknown non-load-bearing. The
  first deploy settles it with a single request for an extensionless route, and
  the answer is recorded in the smoke output.
- **The hosting choice is settled (2026-09-14).** 07 was taken: this repository
  keeps its name and reaches a URL root by attaching the porkbun custom domain
  to it. The two candidate paths were a `<owner>.github.io` user-site repository
  (default host, domain later) and this project repository under the custom
  domain (domain now, no rename); the materialization is identical either way.
  The user-site path is recorded as the fallback.
- **What this supersedes.** A retired effort decided the tree was publishable and
  that the disclaimer would be the user's own change; it left the publish
  mechanism and the raw-asset question open. This effort closes the mechanism and
  leaves the raw-asset question to its own ADR.
- **The limits in one place.** Published site: 1 GB hard. Deploy: 10 minutes
  hard, cannot be raised. Bandwidth: 100 GB/month soft. Artifact: an uncompressed
  tar under 10 GB, with symlinks and hard links dereferenced, so a symlink farm
  cannot shrink it. Artifact storage quota bills only private repositories; Pages
  and standard hosted runners are free for public repositories.
