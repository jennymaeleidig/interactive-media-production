# GitHub Pages as the host for a large pre-built static site

**Question under test:** can GitHub Pages host this site — 1,181 HTML pages, 4,466 files, ~660 MB,
root-absolute asset paths (`/assets/<sha16>.<ext>`), 67 legacy URLs that must 301-redirect, unknown
paths that must 404 — and which of the plan's assumptions are actually true?

**Evidence standard.** Primary sources only: `docs.github.com`, the `github/docs` content repo,
`actions/{configure-pages,upload-pages-artifact,deploy-pages}` (`action.yml`, `README.md`, `src/`,
release tags), `actions/starter-workflows`, GitHub Changelog, the GitHub REST docs / OpenAPI schema,
`jekyllrb.com` and the first-party `jekyll/*` plugin repos, `pages.github.com/versions.json`.
No third-party blog, StackOverflow answer, or AI summary is a source for any claim below.

**Three evidence grades used throughout.**

* **Documented** — a primary source says it, quoted verbatim, with the URL.
* **Observed** — no primary source says it, but it was measured here against live GitHub Pages
  origins whose Pages configuration was confirmed via `GET /repos/{owner}/{repo}/pages`
  (build_type, cname, source branch, status). Full transcript in **Appendix A**. Observed
  behavior is not a contract; it can change without notice.
* **`UNCONFIRMED — infer empirically`** — neither documented nor measured here; the experiment
  that would settle it is named.

**Version context (matters — the actions moved fast).** Unless stated otherwise, raw `action.yml`
/ `src` quotes are from each action's `main` branch as fetched on 2026-09-14; docs quotes are the
live `docs.github.com` pages and the `github/docs` `main` branch on the same date. As of that date
the docs cite `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4` for
github.com/GHEC, while `actions/starter-workflows` `main` cites `configure-pages@v5`,
`upload-pages-artifact@v3`, `deploy-pages@v5`. Latest releases: `configure-pages` v6.0.0
(2026-03-25), `deploy-pages` v5 (its `action.yml` is unchanged in shape across v3–v5 for the
inputs quoted here). Where a version matters, the tag is named explicitly.

**Three premise corrections up front** (details in the relevant sections):

1. `actions/configure-pages` has **no `enable_jekyll` input and no `cname` input** — not in v0.1.0,
   v1, v2, v3, v4, v5, v6, or `main` (§1.1). Code search across the `actions` org for
   `enable_jekyll` returns zero results.
2. `actions/upload-pages-artifact` produces an **uncompressed** `tar` (`tar ... -cvf`), not a
   tar+gzip of its own; the gzip wrapper is a requirement of the artifact *storage* layer, and the
   docs enforce "a compressed `gzip` archive containing a single `tar` file" as a property of the
   artifact (§1.2, §4).
3. The published-site limit is **not described as a hard 1 GB cap with an automatic shutdown**;
   the docs say sites "may be no larger than 1 GB", and the documented enforcement language is
   that GitHub "may not be able to serve your site, or you may receive a polite email" (§3).

---
## 1. Deployment mechanics with GitHub Actions

### 1.1 `actions/configure-pages` — authoritative inputs and outputs

The authoritative input list is the full `inputs:` block of `action.yml`. It documents
exactly four inputs: `static_site_generator`, `generator_config_file`, `token`, `enablement`.

Claim: `actions/configure-pages` (main) accepts four inputs — `static_site_generator`,
`generator_config_file`, `token` (default `${{ github.token }}`, required) and `enablement`
(default `'false'`).
Source: https://raw.githubusercontent.com/actions/configure-pages/main/action.yml
Quote:

```yaml
inputs:
  static_site_generator:
    description: 'Optional static site generator to attempt to configure: "nuxt", "next", "gatsby", or "sveltekit"'
    required: false
  generator_config_file:
    description: 'Optional file path to static site generator configuration file'
    required: false
  token:
    description: 'GitHub token'
    default: ${{ github.token }}
    required: true
  enablement:
    description: 'Try to enable Pages for the repository if it is not already enabled. This option requires a token other than `GITHUB_TOKEN` to be provided. In the context of a Personal Access Token, the `repo` scope or Pages write permission is required. In the context of a GitHub App, the `administration:write` and `pages:write` permissions are required.'
    default: 'false'
    required: false
```

Claim: `enablement` in v1/v2 defaulted to `'true'` with a different description, and was
later changed to default `'false'`; the input set is otherwise identical across v1–v5.
Source: https://raw.githubusercontent.com/actions/configure-pages/v2/action.yml
Quote: `enablement:` `description: 'Should a Pages site be enabled for the repository if not so already?'` / `default: 'true'`
(and the same in https://raw.githubusercontent.com/actions/configure-pages/v1/action.yml).

Claim: `enable_jekyll`, `cname`, and `preview` are NOT inputs of `actions/configure-pages`
(absent from the action.yml input list at v1, v2, v3, and main). `preview` is instead an
input of `actions/deploy-pages` (see 1.3). Evidence is the complete `inputs:` block above
(main) and the identical block in v1/v2/v3.
Source (v3): https://raw.githubusercontent.com/actions/configure-pages/v3/action.yml
Source (v1): https://raw.githubusercontent.com/actions/configure-pages/v1/action.yml
Quote (v1, complete input list, showing no `enable_jekyll`/`cname`/`preview`):
`static_site_generator`, `generator_config_file`, `token`, `enablement`.

Claim: `actions/configure-pages` documents four outputs — `base_url`, `origin`, `host`, `base_path`.
Source: https://raw.githubusercontent.com/actions/configure-pages/main/action.yml
Quote:

```yaml
outputs:
  base_url:
    description: 'GitHub Pages site full base URL. Examples: "https://octocat.github.io/my-repo", "https://octocat.github.io", "https://www.example.com"'
  origin:
    description: 'GitHub Pages site origin. Examples: "https://octocat.github.io", "https://www.example.com"'
  host:
    description: 'GitHub Pages site host. Examples: "octocat.github.io", "www.example.com"'
  base_path:
    description: 'GitHub Pages site full base path. Examples: "/my-repo" or ""'
```

(The v1 output examples used trailing slashes: `"https://octocat.github.io/my-repo/"` and `base_path: "/my-repo/" or "/"` — https://raw.githubusercontent.com/actions/configure-pages/v1/action.yml.)

Claim: the docs describe `configure-pages` as the action that enables Pages and gathers
site metadata, and show it used as a bare step.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages#configuring-the-configure-pages-action
Quote: "GitHub Actions enables the use of GitHub Pages through the `configure-pages` action, which also lets you gather different metadata about a website."

### 1.2 `actions/upload-pages-artifact` — what it uploads, tarball, name, defaults

Claim: `actions/upload-pages-artifact` (main) documents four inputs: `name` (default
`github-pages`), `path` (required, default `_site/`), `retention-days` (default `1`), and
`include-hidden-files` (default `false`, excludes `.git` and `.github` regardless); output
`artifact_id`.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
Quote:

```yaml
inputs:
  name:
    description: 'Artifact name'
    required: false
    default: 'github-pages'
  path:
    description: "Path of the directory containing the static assets."
    required: true
    default: "_site/"
  retention-days:
    description: "Duration after which artifact will expire in days."
    required: false
    default: "1"
  include-hidden-files:
    description: "Include hidden files and directories (those starting with a dot) in the artifact. Excludes .git and .github regardless."
    required: false
    default: "false"
outputs:
  artifact_id:
    description: "The ID of the artifact that was uploaded."
    value: ${{ steps.upload-artifact.outputs.artifact-id }}
```

Claim: it is a composite action; on Linux/macOS/Windows it runs `tar` (macOS uses `gtar`)
over the `path` directory into `$RUNNER_TEMP/artifact.tar`, then uploads that single file via
`actions/upload-artifact` with the configured `name` and `retention-days`. Note the tar flag
is `-cvf` (no gzip flag), and `--dereference --hard-dereference` is used, with `.git` and
`.github` always excluded and hidden files excluded unless `include-hidden-files: true`.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
Quote:

```yaml
runs:
  using: composite
  steps:
    - name: Archive artifact
      shell: sh
      if: runner.os == 'Linux'
      run: |
        echo ::group::Archive artifact
        tar \
          --dereference --hard-dereference \
          --directory "$INPUT_PATH" \
          -cvf "$RUNNER_TEMP/artifact.tar" \
          --exclude=.git \
          --exclude=.github \
          ${{ inputs.include-hidden-files != 'true' && '--exclude=.[^/]*' || '' }} \
          .
        echo ::endgroup::
```

Quote (the upload step, main — note the pinned inner upload-artifact):

```yaml
    - name: Upload artifact
      id: upload-artifact
      uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: ${{ inputs.name }}
        path: ${{ runner.temp }}/artifact.tar
        retention-days: ${{ inputs.retention-days }}
        if-no-files-found: error
```

Claim: in the v3 tag, the same composite calls `actions/upload-artifact@v4` and has the same
archive step but no `include-hidden-files` input.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/v3/action.yml
Quote: `uses: actions/upload-artifact@v4` / `with: name: ${{ inputs.name }}` / `path: ${{ runner.temp }}/artifact.tar`.

Claim: the artifact is (per the action's own README and the docs) a single gzip archive
containing a single tar file named `github-pages`, tar under 10GB, no symlinks/hard links.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md
Quote:

```
- Be named `github-pages`
- Be a single [`gzip` archive][gzip] containing a single [`tar` file][tar]

The [`tar` file][tar] must:

- be under 10GB in size (we recommend under 1 GB!)
```

Claim: the docs restate the expected artifact shape and the 10GB cap.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages#configuring-the-upload-pages-artifact-action
Quote: "The GitHub Pages artifact should be a compressed `gzip` archive containing a single `tar` file. The `tar` file must be under 10GB in size and should not contain any symbolic or hard links."

Claim: `upload-pages-artifact` (v2/v3 era) shipped the artifact as `github-pages` and took
`path`/`retention-days`; the README's own example uses `path: build_outputs_folder/`.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/v3/README.md
Quote: "A Pages artifact must:" / "- Be called `github-pages`" / "- Be a single [`gzip` archive][gzip] containing a single [`tar` file][tar]".

### 1.3 `actions/deploy-pages` — inputs, defaults, polling, timeout

Claim: `actions/deploy-pages` (main) documents inputs `token` (required, default
`${{ github.token }}`), `timeout` (default `'600000'`), `error_count` (default `'10'`),
`reporting_interval` (default `'5000'`), `artifact_name` (default `'github-pages'`),
`preview` (default `'false'`), and output `page_url`.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/action.yml
Quote:

```yaml
inputs:
  token:
    description: 'GitHub token'
    default: ${{ github.token }}
    required: true
  timeout:
    description: 'Time in milliseconds after which to timeout and cancel the deployment (default: 10 minutes)'
    required: false
    default: '600000'
  error_count:
    description: 'Maximum number of status report errors before cancelling a deployment (default: 10)'
    required: false
    default: '10'
  reporting_interval:
    description: 'Initial time between deployment status reports; successful polls use capped backoff and jitter, with error backoff added separately (default: 5 seconds)'
    required: false
    default: '5000'
  artifact_name:
    description: 'Name of the artifact to deploy'
    required: false
    default: 'github-pages'
  preview:
    description: 'Is this attempting to deploy a pull request as a GitHub Pages preview site? (NOTE: This feature is only in alpha currently and is not available to the public!)'
    required: false
    default: 'false'
outputs:
  page_url:
    description: 'URL to deployed GitHub Pages'
```

Claim: the action's entrypoint creates the deployment (via the Pages API), emits the
`page_url` output, then polls the deployment status; the `preview` context swaps in the
preview URL.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/index.js
Quote:

```js
    const deploymentInfo = await deployment.create(idToken)

    // Output the deployed Pages URL
    let pageUrl = deploymentInfo?.['page_url'] || ''
    const previewUrl = deploymentInfo?.['preview_url'] || ''
    if (isPreview && previewUrl) {
      pageUrl = previewUrl
    }
    core.setOutput('page_url', pageUrl)

    await deployment.check()
```

Claim: the timeout is hard-capped at a maximum of 600000 ms; a `timeout` input above the
maximum is warned about and clamped, and a missing/non-positive value falls back to the
maximum.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
Quote:

```js
const MAX_TIMEOUT = 600000
const DEFAULT_REPORTING_INTERVAL = 5000
const MAX_REPORTING_INTERVAL = 30000
const REPORTING_BACKOFF_MULTIPLIER = 1.5
const REPORTING_JITTER_FACTOR = 0.2
const ONE_GIGABYTE = 1073741824
const SIZE_LIMIT_DESCRIPTION = '1 GB'
```

Quote (the clamp):

```js
    if (Number(core.getInput('timeout')) > MAX_TIMEOUT) {
      core.warning(
        `Warning: timeout value is greater than the allowed maximum - timeout set to the maximum of ${MAX_TIMEOUT} milliseconds.`
      )
    }

    const timeoutInput = Number(core.getInput('timeout'))
    this.timeout = !timeoutInput || timeoutInput <= 0 ? MAX_TIMEOUT : Math.min(timeoutInput, MAX_TIMEOUT)
```

Claim: the polling loop sleeps an initial jittered `reporting_interval` (default 5000 ms),
applies capped backoff of ×1.5 up to 30000 ms on success, backs off separately on errors, and
on `error_count` exceeded or timeout reached it calls `core.setFailed(...)` and explicitly
cancels the deployment.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
Quote:

```js
    const reportingIntervalInput = Number(core.getInput('reporting_interval'))
    const initialReportingInterval =
      Number.isFinite(reportingIntervalInput) && reportingIntervalInput > 0
        ? reportingIntervalInput
        : DEFAULT_REPORTING_INTERVAL
    const maxReportingInterval = Math.max(MAX_REPORTING_INTERVAL, initialReportingInterval)
    const maxErrorCount = Number(core.getInput('error_count'))
```

Quote (timeout handling):

```js
      // Handle timeout
      if (Date.now() - this.startTime >= this.timeout) {
        core.error('Timeout reached, aborting!')
        core.setFailed('Timeout reached, aborting!')

        // Explicitly cancel the deployment
        await this.cancel()
        return
      }
```

Claim: the docs put a hard 10-minute cap on any Pages deployment (this is the same 600000 ms
default/max as the action).
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote: "- GitHub Pages deployments will timeout if they take longer than 10 minutes."

### 1.4 Required workflow `permissions`, and why

Claim: `deploy-pages` requires the job to grant `pages: write` and `id-token: write`; the
docs state the minimum.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages#deploying-github-pages-artifacts
Quote: "- The job must have a minimum of `pages: write` and `id-token: write` permissions."

Claim: the `id-token: write` permission is needed because the action fetches an OIDC ID token
(`core.getIDToken()`); failure to get it fails with an explicit message.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/index.js
Quote:

```js
  let idToken = ''
  try {
    idToken = await core.getIDToken()
  } catch (error) {
    console.log(error)
    core.setFailed(`Ensure GITHUB_TOKEN has permission "id-token: write".`)
    return
  }
```

Claim: `pages: write` is needed to create the Pages deployment; a 403 from the API is
surfaced as a permission error.
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
Quote: `errorMessage += ' Ensure GITHUB_TOKEN has permission "pages: write".'`

Claim: the starter workflow documents the permission block's purpose in a comment.
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml
Quote: `# Sets permissions of the GITHUB_TOKEN to allow deployment to GitHub Pages`
followed by `permissions: contents: read, pages: write, id-token: write`.

### 1.5 The `environment:` block

Claim: a deployment `environment` named `github-pages` is required to enforce branch/deployment
protection rules; the `url:` field exposes the deployed page URL via the action output.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages#deploying-github-pages-artifacts
Quote: "- An `environment` must be established to enforce branch/deployment protection rules. The default environment is `github-pages`."
Quote: "- To specify the URL of the page as an output, utilize the `url:` field."

Claim: the starter workflow declares the environment exactly this way.
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml
Quote:

```yaml
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
```

Claim: the environment is created automatically if absent; GitHub recommends a deployment
protection rule restricting it to the default branch.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#creating-a-custom-github-actions-workflow-to-publish-your-site
Quote: "The workflow templates use a deployment environment called `github-pages`. If your repository does not already include an environment called `github-pages`, the environment will be created automatically. We recommend that you add a deployment protection rule so that only the default branch can deploy to this environment."

### 1.6 Concurrency guidance

Claim: the official starter workflow carries the canonical concurrency block: group `"pages"`
with `cancel-in-progress: false`, so one deployment runs at a time and queued runs are not
cancelled.
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml
Quote:

```yaml
# Allow only one concurrent deployment, skipping runs queued between the run in-progress and latest queued.
# However, do NOT cancel in-progress runs as we want to allow these production deployments to complete.
concurrency:
  group: "pages"
  cancel-in-progress: false
```

Claim: the docs page "Using custom workflows with GitHub Pages" does not itself show the
`concurrency` block; the only YAML on that page is the per-action snippets reproduced in 1.7
below. (The canonical `concurrency` block lives in the starter workflow file.)
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
Quote (top of page, showing the page is snippet-based): "You can take advantage of using GitHub Actions and GitHub Pages by creating a workflow file or choosing from the predefined workflows."

### 1.7 The official starter workflow YAML

The docs page is snippet-based, not a single complete workflow. It shows five YAML snippets,
quoted verbatim here.

Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

Snippet 1 — `configure-pages` step:

```yaml
- name: Configure GitHub Pages
  uses: actions/configure-pages@v5
```

Snippet 2 — `upload-pages-artifact` step:

```yaml
- name: Upload GitHub Pages artifact
  uses: actions/upload-pages-artifact@v4
```

Snippet 3 — deploy job with the permission/environment block:

```yaml
# ...

jobs:
  deploy:
    permissions:
      contents: read
      pages: write
      id-token: write
    runs-on: ubuntu-latest
    needs: jekyll-build
    environment:
      name: github-pages
      url: ${{steps.deployment.outputs.page_url}}
    steps:
      - name: Deploy artifact
        id: deployment
        uses: actions/deploy-pages@v4
# ...
```

Snippet 4 — linked build + deploy jobs:

```yaml
# ...

jobs:
  # Build job
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5
      - name: Build with Jekyll
        uses: actions/jekyll-build-pages@v1
        with:
          source: ./
          destination: ./_site
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v4

  # Deployment job
  deploy:
    environment:
      name: github-pages
      url: ${{steps.deployment.outputs.page_url}}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
# ...
```

Snippet 5 — single deploy job (no build), closest to the static-site case:

```yaml
# ...

jobs:
  # Single deploy job no building
  deploy:
    environment:
      name: github-pages
      url: ${{steps.deployment.outputs.page_url}}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload Artifact
        uses: actions/upload-pages-artifact@v4
        with:
          # upload entire directory
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

# ...
```

Claim: the canonical `pages` starter in `actions/starter-workflows` IS a single complete
workflow and differs from the docs snippets (it adds triggers, the concurrency block,
`actions/checkout@v4`, `upload-pages-artifact@v3`, `deploy-pages@v5`, and `path: '.'`).
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml
Quote (entire file, verbatim):

```yaml
# Simple workflow for deploying static content to GitHub Pages
name: Deploy static content to Pages

on:
  # Runs on pushes targeting the default branch
  push:
    branches: [$default-branch]

  # Allows you to run this workflow manually from the Actions tab
  workflow_dispatch:

# Sets permissions of the GITHUB_TOKEN to allow deployment to GitHub Pages
permissions:
  contents: read
  pages: write
  id-token: write

# Allow only one concurrent deployment, skipping runs queued between the run in-progress and latest queued.
# However, do NOT cancel in-progress runs as we want to allow these production deployments to complete.
concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  # Single deploy job since we're just deploying
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          # Upload entire repository
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

Claim: there is no `pages.yml` starter in `actions/starter-workflows`; the directory listing
contains `static.yml` (and other generator-specific starters), not `pages.yml`.
Source: https://api.github.com/repos/actions/starter-workflows/contents/pages
Quote (from the JSON listing): `"name": "static.yml"` / `"download_url": "https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml"`.

---

## 2. Branch-source deployment (`build_type: legacy` / `gh-pages` branch / `/docs` folder)

### 2.1 Publishing-source options

Claim: the publishing source is either a branch (optionally a folder on it) or a GitHub
Actions workflow; the docs recommend a branch when no build control is needed and Actions
otherwise.
Source: https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/pages-about-publishing-source.md
Quote (renderable with the documented variable expansion "GitHub Pages"/"GitHub Actions"):

```
You can publish your site when changes are pushed to a specific branch, or you can write a {% data variables.product.prodname_actions %} workflow to publish your site.
...
If you do not need any control over the build process for your site, we recommend that you publish your site when changes are pushed to a specific branch.
...
If you want to use a build process other than Jekyll or you do not want a dedicated branch to hold your compiled static files, we recommend that you write a {% data variables.product.prodname_actions %} workflow to publish your site.
```

Claim: for a branch source, the branch can be any branch and the folder can be `/` or `/docs`;
changes pushed to the source branch are published.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-from-a-branch
Quote: "The source branch can be any branch in your repository, and the source folder can either be the root of the repository (`/`) on the source branch or a `/docs` folder on the source branch. Whenever changes are pushed to the source branch, the changes in the source folder will be published to your GitHub Pages site."

Claim: the UI exposes this as "Deploy from a branch" with a branch dropdown and an optional
folder dropdown, plus "GitHub Actions" as the alternative Source.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-from-a-branch
Quote: "Under \"Build and deployment\", under \"Source\", select **Deploy from a branch**." / "Under \"Build and deployment\", use the branch dropdown menu and select a publishing source." / "Optionally, use the folder dropdown menu to select a folder for your publishing source."

Claim: when a branch source is used, deployment still runs through a GitHub Actions workflow
run even if another CI tool built the branch (e.g. a `gh-pages` branch), and that workflow
detects there is no build step needed.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#troubleshooting-publishing-from-a-branch
Quote: "Your GitHub Pages site will always be deployed with a GitHub Actions workflow run, even if you've configured your GitHub Pages site to be built using a different CI tool. Most external CI workflows \"deploy\" to GitHub Pages by committing the build output to the `gh-pages` branch of the repository, and typically include a `.nojekyll` file. When this happens, the GitHub Actions workflow will detect the state that the branch does not need a build step, and will execute only the steps necessary to deploy the site to GitHub Pages servers."

### 2.2 Build rate limit (branch vs Actions)

Claim: branch-source sites are subject to a *soft* limit of 10 builds per hour, and that limit
does NOT apply when building/publishing with a custom GitHub Actions workflow.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote: "- GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."

Claim: the overall usage-limits list also includes the bandwidth soft limit and rate limits,
in the same bulleted list as the build limit.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote: "- GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month." / "- In order to provide consistent quality of service for all GitHub Pages sites, rate limits may apply. These rate limits are not intended to interfere with legitimate uses of GitHub Pages. If your request triggers rate limiting, you will receive an appropriate response with an HTTP status code of `429`, along with an informative HTML body."

Claim: the 10-minute deployment timeout applies regardless of source (it is a deployment
limit, not a branch-build limit).
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote: "- GitHub Pages deployments will timeout if they take longer than 10 minutes."

(Cross-reference item 3 for the full limits table; the branch-vs-Actions difference is only
the `*soft* limit of 10 builds per hour`, which explicitly "does not apply if you build and
publish your site with a custom GitHub Actions workflow.")

### 2.3 Published-site size limit on this route

Claim: the published site may be no larger than 1 GB, and the source repository has a
recommended 1 GB limit; this is stated as a general Pages limit, not a branch-only one.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote:

```
- GitHub Pages source repositories have a recommended limit of 1 GB. For more information, see About large files on GitHub.
- Published GitHub Pages sites may be no larger than 1 GB.
```

Claim: the `upload-pages-artifact` README independently states the supported maximum is 1GB
and that larger tarballs are not guaranteed to deploy (with an unofficial 10GB hard cap).
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md
Quote: ":warning: The GitHub Pages [officially supported maximum size limit is 1GB][pages-usage-limits], so the subsequent deployment of larger tarballs are not guaranteed to succeed &mdash; often because they are more prone to exceeding the maximum deployment timeout of 10 minutes."
Quote: "⛔ However, there is also an _unofficial_ absolute maximum size limit of 10GB, which Pages will not even _attempt_ to deploy."

(Cross-reference item 3 for the whole limits section; the branch-vs-Actions difference is the
build-allowance bullet, not the size limit — the 1 GB published-site limit is stated without
a route qualifier.)

### 2.4 REST API `build_type` values and source object

Claim: `build_type` has possible values `"legacy"` and `"workflow"` (create endpoint).
Source: https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#create-a-github-pages-site
Quote: `build_type` `string` — "The process in which the Page will be built. Possible values are \"legacy\" and \"workflow\" ." / "Can be one of : legacy , workflow".

Claim: the update endpoint defines the two values explicitly.
Source: https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#update-information-about-a-github-pages-site
Quote: `build_type` `string` — "The process by which the GitHub Pages site will be built. workflow means that the site is built by a custom GitHub Actions workflow. legacy means that the site is built by GitHub when changes are pushed to a specific branch." / "Can be one of : legacy , workflow".

Claim: the `source` object carries the branch and the directory, whose allowed paths are `/`
or `/docs`.
Source: https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#create-a-github-pages-site
Quote:

```
source object

The source branch and directory used to publish your Pages site.

Properties of source

branch string Required

The repository branch used to publish your site's source files.

path string

The repository directory that includes the source files for the Pages site. Allowed paths are / or /docs . Default: /
```

Claim: on the update endpoint, `source.branch` and `source.path` are both required.
Source: https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#update-information-about-a-github-pages-site
Quote: "Update the source for the repository. Must include the branch name and path." / "branch string Required" / "path string Required ... Allowed paths are / or /docs ."

### 2.5 Jekyll-by-default on a branch source, and `.nojekyll` (brief; full treatment in item 11)

Claim: when publishing from a source branch, GitHub Pages runs Jekyll by default; to use
another static site generator you either use an Actions workflow or disable the Jekyll build
by adding an empty `.nojekyll` file at the root of the publishing source.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#static-site-generators
Quote: "If you publish your site from a source branch, GitHub Pages will use Jekyll to build your site by default. If you want to use a static site generator other than Jekyll, we recommend that you write a GitHub Actions to build and publish your site instead. Otherwise, disable the Jekyll build process by creating an empty file called `.nojekyll` in the root of your publishing source, then follow your static site generator's instructions to build your site locally."

(Same statement in the docs source markdown:
https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/creating-a-github-pages-site.md
— there written with the `{% data variables.product.prodname_pages %}` template variable.
This fragment only states the branch-source default; the full Jekyll behavior belongs to item 11.)

---

## 3. Published site size and usage limits

**C3.1 — The published-site size limit is 1 GB, and it is worded as a flat cap ("may be no larger than"), not as a "soft" limit.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "Published GitHub Pages sites may be no larger than 1 GB."

**C3.2 — The same 1 GB cap appears verbatim in the docs source markdown under the `## Usage limits` heading.**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md
> `* Published {% data variables.product.prodname_pages %} sites may be no larger than 1 GB.`

**C3.3 — The section heading is exactly "Usage limits"; the page title is "GitHub Pages limits".**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md
> ```
> title: GitHub Pages limits
> intro: 'Learn about the limits and limitations of GitHub Pages.'
> ```
> `## Usage limits`

**C3.4 — The complete documented Pages usage-limits list, verbatim as one block (rendered wording; the raw markdown marks the two "soft" limits with `_soft_` emphasis).**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> ```
> GitHub Pages sites are subject to the following usage limits:
>
> - You can only create one user or organization site for each account on GitHub.
> - GitHub Pages source repositories have a recommended limit of 1 GB. For more information, see About large files on GitHub.
> - Published GitHub Pages sites may be no larger than 1 GB.
> - GitHub Pages deployments will timeout if they take longer than 10 minutes.
> - GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month.
> - GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow.
> - In order to provide consistent quality of service for all GitHub Pages sites, rate limits may apply. These rate limits are not intended to interfere with legitimate uses of GitHub Pages. If your request triggers rate limiting, you will receive an appropriate response with an HTTP status code of `429`, along with an informative HTML body.
> ```

**C3.5 — The three limits the assignment asks for appear in that single block exactly as: 100 GB/month (soft), 10 builds/hour (soft, with an Actions-workflow exception), 1 GB published size.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month."
> "GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."
> "Published GitHub Pages sites may be no larger than 1 GB."

**C3.6 — The documented consequence of exceeding a quota is serving degradation/email support guidance — NOT a documented automatic disable of the site.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "If your site exceeds these usage quotas, we may not be able to serve your site, or you may receive a polite email from GitHub Support suggesting strategies for reducing your site's impact on our servers, including putting a third-party content distribution network (CDN) in front of your site, making use of other GitHub features such as releases, or moving to a different hosting service that might better fit your needs."

**C3.7 — The phrase "GitHub Pages sites may be disabled" (or equivalent) is NOT present on the Pages limits page; the only enforcement statement there is C3.6.**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md
> (Full raw page text was read; the only enforcement/consequence sentence is the "If your site exceeds these usage quotas…" paragraph quoted in C3.6. There is no "disabled" wording in this file.)
> `UNCONFIRMED — infer empirically` for any automatic disable/serving cutoff: run a site past the 1 GB published size (or the 100 GB/month bandwidth) in a test account and observe whether the site returns an error page, a 404, or keeps serving; then check the account email for a Support notice.

**C3.8 — The commercial-use / prohibited-purpose language is the opening paragraph of the same "Usage limits" section (it is policy, not a size limit).**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS). GitHub Pages sites shouldn't be used for sensitive transactions like sending passwords or credit card numbers."

**C3.9 — The page also ties Pages use to the GitHub Terms of Service restrictions.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "In addition, your use of GitHub Pages is subject to the GitHub Terms of Service, including the restrictions on get-rich-quick schemes, sexually obscene content, and violent or threatening content or activity."

**C3.10 — The 1 GB "source repository" limit is a *recommended* limit that points at GitHub's general repository-size guidance, which is also a recommendation, not a hard cap.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages source repositories have a recommended limit of 1 GB. For more information, see About large files on GitHub."
Source: https://raw.githubusercontent.com/github/docs/main/content/repositories/working-with-files/managing-large-files/about-large-files-on-github.md
> `We recommend repositories remain small, ideally less than 1 GB, and less than 5 GB is strongly recommended. Smaller repositories are faster to clone and…`

**C3.11 — For Enterprise Managed Users there is an additional limits section, but it does not change any size/bandwidth number.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#limits-for-enterprise-managed-users
> "If you're an enterprise managed user, your use of GitHub Pages is limited."

**C3.12 — Whether the Actions-artifact deployment route is subject to the same published-site limits: the docs draw exactly ONE route distinction, and it is the 10-builds-per-hour soft limit, which does not apply to custom Actions workflows. No route distinction is made for published site size, bandwidth, the 10-minute deploy timeout, or site count.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."

**C3.13 — The "1 GB published site" line is stated generically with no conditional on build type; it is a single flat sentence in one unqualified bullet list. The only conditional in that list is the Actions-workflow exception on the builds/hour bullet (C3.12).**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/github-pages-limits.md
> ```
> * Published {% data variables.product.prodname_pages %} sites may be no larger than 1 GB.
> * {% data variables.product.prodname_pages %} deployments will timeout if they take longer than 10 minutes.
> {% ifversion fpt or ghec %}
> * {% data variables.product.prodname_pages %} sites have a _soft_ bandwidth limit of 100 GB per month.
> * {% data variables.product.prodname_pages %} sites have a _soft_ limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom {% data variables.product.prodname_actions %} workflow.
> ```
> (The `{% ifversion %}` blocks are plan gates for Free/Pro/Team/Enterprise Cloud, not route gates.)

**C3.14 — Everything is deployed through an Actions workflow run regardless of how the site is built, which is why no build-route distinction exists for serving limits.**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site.md
> "Your GitHub Pages site will always be deployed with a GitHub Actions workflow run, even if you've configured your GitHub Pages site to be built using a different CI tool."

**C3.15 — The Actions route additionally has its own artifact-level ceiling documentation in the `upload-pages-artifact` README: the officially supported maximum is stated as 1 GB, matching the published-site limit.**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md
> "- be under 10GB in size (we recommend under 1 GB!)
>   - :warning: The GitHub Pages [officially supported maximum size limit is 1GB][pages-usage-limits], so the subsequent deployment of larger tarballs are not guaranteed to succeed &mdash; often because they are more prone to exceeding the maximum deployment timeout of 10 minutes.
>   - ⛔ However, there is also an _unofficial_ absolute maximum size limit of 10GB, which Pages will not even _attempt_ to deploy."

**C3.16 — That README's 1 GB link points at the legacy anchor `about-github-pages#usage-limits`, which is a stale target: "What is GitHub Pages?" (= `about-github-pages`) currently has no limits section; the live limits content is on `github-pages-limits#usage-limits` (C3.3).**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md
> `[pages-usage-limits]: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#usage-limits`
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
> Heading list on that page (my framing; each heading is quoted exactly from the page): "About GitHub Pages", "Types of GitHub Pages sites", "Hosting on your own custom domain", "Data collection", "Further reading". No "Usage limits" or "Limits on use" heading is present.

**C3.17 — The REST surface for Pages exposes NO size field. `GET /repos/{owner}/{repo}/pages` returns url, status, cname, custom_404, html_url, source, public, pending_domain_unverified_at, protected_domain_state, https_certificate, https_enforced — and no size/bytes field.**
Source: https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site
> ```
> { "url": "https://api.github.com/repos/github/developer.github.com/pages", "status": "built", "cname": "developer.github.com", "custom_404": false, "html_url": "https://developer.github.com", "source": { "branch": "master", "path": "/" }, "public": true, "pending_domain_unverified_at": "2024-04-30T19:33:31Z", "protected_domain_state": "verified", "https_certificate": { "state": "approved", "description": "Certificate is approved", "domains": [ "developer.github.com" ], "expires_at": "2021-05-22" }, "https_enforced": true }
> ```

**C3.18 — `build_type` exists on the Pages REST object but describes the build process only ("legacy" vs "workflow") — it exposes nothing about size.**
Source: https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json (components, `build_type`)
> `"build_type": { "type": "string", "description": "The process in which the Page will be built. Possible values are `\"legacy\"` and `\"workflow\"`.", "enum": […`
> (rendered at https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site)

**C3.19 — The Pages deployment endpoints likewise carry no size field: the documented response of "Create a GitHub Pages deployment" is only `id`, `status_url`, `page_url`.**
Source: https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment
> ```
> { "id": "4fd754f7e594640989b406850d0bc8f06a121251", "status_url": "https://api.github.com/repos/github/developer.github.com/pages/deployments/4fd754f7e594640989b406850d0bc8f06a121251/status", "page_url": "developer.github.com" }
> ```

**C3.20 — The only REST resource in this flow that reports a byte size is the Actions artifact object (`size_in_bytes`), which is what `deploy-pages` reads to compare against the 1 GB bound.**
Source: https://docs.github.com/en/rest/actions/artifacts#list-artifacts-for-a-repository
> `{ "id": 11, "node_id": "MDg6QXJ0aWZhY3QxMQ==", "name": "Rails", "size_in_bytes": 556, "url": "https://api.github.com/repos/octo-org/octo-docs/actions/artifacts/11", …`
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/api-client.js
> ```
>     const filteredArtifacts = response.data.artifacts.filter(artifact => artifact.name === artifactName)
> ```
> (and) `if (!artifact.size) { core.warning('Artifact size was not found. Unable to verify if artifact size exceeds the allowed size.') }`

**C3.21 — `deploy-pages` treats the 1 GB figure as an advisory warning at deploy time, not a client-side rejection: exceeding it logs a warning and lets the deploy proceed.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const ONE_GIGABYTE = 1073741824
> const SIZE_LIMIT_DESCRIPTION = '1 GB'
> ```
> ```
>       if (artifactData?.size > ONE_GIGABYTE) {
>         core.warning(
>           `Uploaded artifact size of ${artifactData?.size} bytes exceeds the allowed size of ${SIZE_LIMIT_DESCRIPTION}. Deployment might fail.`
>         )
>       }
> ```

**C3.22 — Internal consistency check for a 660 MB site: 660 MB is under the documented 1 GB published-site cap (C3.1) and under the artifact size that triggers C3.21's warning, so no documented size limit is exceeded — the risk is the 10-minute deployment timeout (C3.4) and bandwidth (C3.5), not the size cap.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "Published GitHub Pages sites may be no larger than 1 GB." / "GitHub Pages deployments will timeout if they take longer than 10 minutes."

### 3.x — Full documented limits table (single view)

| Limit | Documented value | Documented as | Verbatim wording (source = the `github-pages-limits` page, `#usage-limits`) |
| --- | --- | --- | --- |
| Sites per account | 1 user/org site | hard | "You can only create one user or organization site for each account on GitHub." |
| Source repository size | 1 GB | **recommended** | "GitHub Pages source repositories have a recommended limit of 1 GB." |
| Published site size | 1 GB | flat cap ("may be no larger than") | "Published GitHub Pages sites may be no larger than 1 GB." |
| Deployment duration | 10 minutes | hard timeout | "GitHub Pages deployments will timeout if they take longer than 10 minutes." |
| Bandwidth | 100 GB/month | **_soft_** | "GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month." |
| Builds | 10/hour | **_soft_**; does not apply to custom Actions workflows | "GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow." |
| Request rate | unspecified | "rate limits may apply", HTTP 429 | "If your request triggers rate limiting, you will receive an appropriate response with an HTTP status code of `429`, along with an informative HTML body." |
| Enforcement | serving degradation / Support email | not a disable | see C3.6 |

---

## 4. Actions artifact limits that would bite a 660 MB artifact

Notes: a 660 MB site is uploaded by `upload-pages-artifact` as one `tar` (uncompressed tar is produced on the
runner) and then wrapped by `actions/upload-artifact`. So both the Actions-artifact limits and the Pages-specific
artifact limits apply.

**C4.1 — `upload-pages-artifact` uploads exactly ONE artifact named `github-pages` containing a single tar.**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
> ```
>     - name: Upload artifact
>       id: upload-artifact
>       uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
>       with:
>         name: ${{ inputs.name }}
>         path: ${{ runner.temp }}/artifact.tar
>         retention-days: ${{ inputs.retention-days }}
>         if-no-files-found: error
> ```

**C4.2 — The Pages-specific documented artifact ceiling: the tar "must be under 10GB", 1 GB is recommended and is the officially supported max, and there is an *unofficial* absolute 10 GB limit that Pages "will not even attempt to deploy".**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md (#artifact-validation)
> ```
> - be under 10GB in size (we recommend under 1 GB!)
>   - :warning: The GitHub Pages [officially supported maximum size limit is 1GB][pages-usage-limits], so the subsequent deployment of larger tarballs are not guaranteed to succeed &mdash; often because they are more prone to exceeding the maximum deployment timeout of 10 minutes.
>   - ⛔ However, there is also an _unofficial_ absolute maximum size limit of 10GB, which Pages will not even _attempt_ to deploy.
> ```

**C4.3 — The same 10 GB figure is baked into `deploy-pages` as the reason string for `deployment_content_failed`, i.e., the failure the platform returns when the artifact is unusable/oversized.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const finalErrorStatus = {
>   deployment_failed: 'Deployment failed, try again later.',
>   deployment_content_failed:
>     'Artifact could not be deployed. Please ensure the content does not contain any hard links, symlinks and total size is less than 10GB.',
> ```

**C4.4 — There is NO documented per-artifact maximum size for Actions artifacts in general. The "Existing system limits" table has a "Storage limits" row that defers to the plan quota table (C4.6) and no artifact-byte row at all.**
Source: https://docs.github.com/en/actions/reference/limits#existing-system-limits
> ```
> | Limit category | Limit | Threshold | Description | Can GitHub Support increase? |
> | Workflow execution limit | Workflow run time | 35 days / workflow run | …
> | All GitHub-hosted runners | Job execution time | 6 hours | …
> | All GitHub-hosted runners | Storage limits | Varies | For more information, see Storage limits for all GitHub-hosted runners . | …
> ```
> (The `Description` column is long; I have kept only the run-time-identical leading words and marked the cut with `…`. This note is mine, not the page's.)
> `UNCONFIRMED — infer empirically`: a general Actions per-artifact byte cap. Experiment: in a test repo, upload artifacts of 1 GB, 2 GB, 5 GB, 10 GB via `actions/upload-artifact@v4+` with `archive: false`, and record the largest size that succeeds plus the exact error message at the boundary.

**C4.5 — The only documented per-job artifact quantity limit is 500 artifacts; size is not constrained there.**
Source: https://raw.githubusercontent.com/actions/upload-artifact/main/README.md (#limitations)
> "Within an individual job, there is a limit of 500 artifacts that can be created for that job."

**C4.6 — Artifact storage is a PLAN QUOTA (shared with GitHub Packages), not a per-file cap, and a 660 MB artifact is above the GitHub Free / Free-for-organizations included 500 MB.**
Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions#free-use-of-github-actions
> ```
> | Plan | Artifact storage | Minutes (per month) | Cache storage (per repository) | Custom image storage |
> | GitHub Free | 500 MB | 2,000 | 10 GB | Not applicable |
> | GitHub Pro | 1 GB | 3,000 | 10 GB | Not applicable |
> | GitHub Free for organizations | 500 MB | 2,000 | 10 GB | Not applicable |
> | GitHub Team | 2 GB | 3,000 | 10 GB | 75 GB |
> | GitHub Enterprise Cloud | 50 GB | 50,000 | 10 GB | 150 GB |
> ```

**C4.7 — Storage quota only bites for PRIVATE repositories; for public repositories (the usual Pages case) standard GitHub-hosted runner usage, including for GitHub Pages, is free.**
Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions#how-use-of-github-actions-is-measured
> "GitHub Actions usage is **free** for **self-hosted runners** and for **public repositories** that use standard GitHub-hosted runners."
Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions#free-use-of-github-actions
> "The use of standard GitHub-hosted runners is free:
>
> - In public repositories
> - For GitHub Pages
> - For Dependabot"

**C4.8 — Documented max job runtime: 6 hours per job, and the documented behavior is termination of the job.**
Source: https://docs.github.com/en/actions/reference/limits#existing-system-limits
> "| All GitHub-hosted runners | Job execution time | 6 hours | Each job in a workflow can run for up to 6 hours of execution time. If a job reaches this limit, the job is terminated a… |  |"
> (`…` marks where the extraction of the long `Description` cell was cut; the Limit/Threshold cells are complete.)

**C4.9 — Documented max workflow run time: 35 days per workflow run, and the documented behavior is cancellation of the run.**
Source: https://docs.github.com/en/actions/reference/limits#existing-system-limits
> "| Workflow execution limit | Workflow run time | 35 days / workflow run | If a workflow run reaches this limit, the workflow run is cancelled. This period includes execution duration, and time s… |  |"
> (`…` marks where the extraction of the long `Description` cell was cut.)

**C4.9b — Related Actions system limits that matter for a large deploy: workflow trigger event rate, workflow-run queue, and the concurrency-group queue depth.**
Source: https://docs.github.com/en/actions/reference/limits#existing-system-limits
> "| Workflows queuing | Workflow trigger event rate limit | 1500 events / 10 seconds / repository | Each repository is limited to events triggering a workflow run. | Support ticket |"
> "| Workflows queuing | Workflow run queued | 500 workflow runs / 10 seconds | When the limit is reached, the workflow runs that were supposed to be triggered by the webhook events will be blocked an… |  |"
> "| Workflows queuing | Concurrency group queue | 100 workflow runs / concurrency group | When using queue: max in the concurrency section, up to 100 jobs or workflow runs can be queued per concurrency group. R… |  |"

**C4.9c — Storage limits specifically cannot be raised by Support, unlike concurrency/minutes.**
Source: https://docs.github.com/en/actions/reference/limits#storage-limits-for-all-github-hosted-runners
> "GitHub Support **cannot** increase storage limits for GitHub Actions."

**C4.10 — Documented Pages DEPLOY time limit is 10 minutes, stated on the Pages limits page (not in the REST API).**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages deployments will timeout if they take longer than 10 minutes."

**C4.11 — `actions/deploy-pages` enforces its own 10-minute client-side timeout, expressed in milliseconds, default `600000`.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/action.yml
> ```
>   timeout:
>     description: 'Time in milliseconds after which to timeout and cancel the deployment (default: 10 minutes)'
>     required: false
>     default: '600000'
> ```

**C4.12 — The timeout input cannot be raised past 600000 ms: the code clamps to MAX_TIMEOUT and warns if a larger value is supplied.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const MAX_TIMEOUT = 600000
> ```
> ```
>     if (Number(core.getInput('timeout')) > MAX_TIMEOUT) {
>       core.warning(
>         `Warning: timeout value is greater than the allowed maximum - timeout set to the maximum of ${MAX_TIMEOUT} milliseconds.`
>       )
>     }
>
>     const timeoutInput = Number(core.getInput('timeout'))
>     this.timeout = !timeoutInput || timeoutInput <= 0 ? MAX_TIMEOUT : Math.min(timeoutInput, MAX_TIMEOUT)
> ```

**C4.13 — There is NO documented `timeout` parameter on the Pages REST deployment endpoint; its body parameters are `artifact_id`, `artifact_url`, `environment`, `pages_build_version`, `oidc_token`. The 10-minute number is enforced by the action and stated on the limits page.**
Source: https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment
> ```
> artifact_id number
> The ID of an artifact that contains the .zip or .tar of static assets to deploy. The artifact belongs to the repository. Either `artifact_id` or `artifact_url` are required.
> artifact_url string
> The URL of an artifact that contains the .zip or .tar of static assets to deploy. The artifact belongs to the repository. Either `artifact_id` or `artifact_url` are required.
> environment string
> The target environment for this GitHub Pages deployment.
> Default: `github-pages`
> pages_build_version string Required
> A unique string that represents the version of the build for this deployment.
> Default: `GITHUB_SHA`
> oidc_token string Required
> The OIDC token issued by GitHub Actions certifying the origin of the deployment.
> ```

**C4.14 — Default Actions artifact retention is 90 days; the configurable range is 1–90 days (longer only if the repository setting is changed).**
Source: https://raw.githubusercontent.com/actions/upload-artifact/main/README.md (#retention-period)
> "Artifacts are retained for 90 days by default. You can specify a shorter retention period using the `retention-days` input:"
Source: https://raw.githubusercontent.com/actions/upload-artifact/main/action.yml (`retention-days`)
> `Duration after which artifact will expire in days. 0 means using default retention. # Minimum 1 day. # Maximum 90 days unless changed from the repository settings page. # Optional. Defaults to repository…`

**C4.15 — `upload-pages-artifact` OVERRIDES that default to 1 day, both in `action.yml` and in its README input table.**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
> ```
>   retention-days:
>     description: "Duration after which artifact will expire in days."
>     required: false
>     default: "1"
> ```
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md (#inputs-)
> ```
> | `retention-days` | `false`   | `1`            | Duration after which artifact will expire in days  |
> ```

**C4.16 — What is NOT documented for a 660 MB Pages artifact (each needs measurement):**
Source: (absence in the primary pages listed in C4.1–C4.15)
> `UNCONFIRMED — infer empirically`: (a) any upload-duration timeout inside `upload-pages-artifact` / `upload-artifact`; (b) the wall-clock tar+upload duration for a ~660 MB archive; (c) whether the platform silently rejects a >1 GB-but-<10 GB artifact. Experiment: push a test repo containing a ~660 MB static tree, run the starter workflow, and record (1) the "Archive artifact" step duration, (2) the "Upload artifact" step duration, (3) the `deploy-pages` polling duration until `succeed`, and (4) the artifact `size_in_bytes` from `GET /repos/{owner}/{repo}/actions/artifacts`. Then repeat at ~1.05 GB and ~5 GB to find the failure boundary and the exact error text.

---


---

## 5. URL resolution semantics of the Pages static origin (the crux)

The site requires extensionless URLs (`/products/flock-os` resolving to `products/flock-os.html`)
and directory URLs (`/foo` → `foo/index.html`). **GitHub documents none of this.** Below: the two
sentences that *are* documented, the first-party evidence that the behavior exists by design, then
the rule set measured on live Pages origins, then what remains unconfirmed.

### 5.1 Documented — the only URL-resolution sentence in the Pages docs

**C5.1 — The documented resolution rule is about `index.html` as the "entry file" for the site, and it must be at the top level of the publishing source (or of the artifact, for a workflow deploy). Nothing is said about subdirectories, extensionless paths, or trailing slashes.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites
Quote:
> "GitHub Pages will look for an `index.html` file as the entry file for your site.
>
> * Make sure you have an `index.html` file in the repository for your site on GitHub. …
> * The entry file must be at the top level of your chosen publishing source. … If your publishing source is a GitHub Actions workflow, the artifact that you deploy must include the entry file at the top level of the artifact."

**C5.2 — The only documented case-sensitivity statement in the Pages docs is about the `index.html` FILENAME, not about URL paths.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites
Quote:
> "* The name of the `index.html` file is case sensitive. For example, `Index.html` will not work.
> * The name of the file should be `index.html`, not `index.HTML` or any other variation."

**C5.3 — Nothing else about path resolution is documented. Evidence is absence in the primary corpus, not a statement:** in the `github/docs` `main` branch (sparse checkout of `content/pages`, `content/repositories`, `content/organizations`, `content/actions`, `content/admin`, `content/rest`, `content/site-policy`, `data/reusables`) the token `extensionless` appears **0** times, `trailing slash` appears **0** times inside `content/pages`, and `case sensitive` appears exactly **once** — the `index.html` sentence in C5.2. There is no Pages doc that describes `.html` appending, directory-index resolution, or slash redirects.
Source: https://github.com/github/docs (repository content, `content/pages/**`; the counts were produced by `grep -rn` over the checkout on 2026-09-14)

### 5.2 Documented — first-party evidence that the behavior is intended, from the generators GitHub itself runs

Nothing states the origin's rules, but two GitHub-endorsed generators only make sense if those rules
hold. These are documented *properties of the tools*, not of the host.

**C5.4 — Jekyll's "pretty" permalink styles emit a *directory containing `index.html`*, i.e. the layout that requires directory-index resolution.**
Source: https://jekyllrb.com/docs/permalinks/
Quote:
> "Permalinks are the output path for your pages, posts, or collections. They allow you to structure the directories of your source code different from the directories in your output."
> … `permalink: /:categories/:year/:month/:day/:title:output_ext` … "a permalink style of `/:categories/:year/:month/:day/:title:output_ext` for the `posts` collection becomes `/:title.html` for pages and collections (excluding `posts` and `drafts`)."

**C5.5 — `jekyll-redirect-from` — listed as a supported dependency of the GitHub Pages Jekyll build (see §7.3) — deliberately emits a real file whose name has NO extension when a redirect path has no trailing slash. That is the ecosystem's answer to extensionless URLs, and it is only coherent if the origin serves an extensionless file as a file.**
Source: https://github.com/jekyll/jekyll-redirect-from (README, "Usage")
Quote:
> "Redirects including a trailing slash will generate a corresponding subdirectory containing an `index.html`, while redirects without a trailing slash will generate a corresponding `filename` without an extension, and without a subdirectory."
> … "`/post/123456789/my-amazing-post` … will generate the following page in the destination: `/post/123456789/my-amazing-post`"

### 5.3 Observed — the rule set on live GitHub Pages origins

Measured with `curl` against origins whose Pages configuration was confirmed through
`GET /repos/{owner}/{repo}/pages` (full transcript, including the repo file layouts used to choose
the test paths: **Appendix A, sections A–D**). All of the following are **observed, not
documented**:

**C5.6 — `.html` appending: a request for `/foo` is served from `foo.html` when that file exists and `foo` is not a directory. Observed at the site root, inside a subdirectory, and under a project-site prefix.**
Observed: `/github` → `200`, byte-identical to `/github.html` (473 bytes) on `jekyllrb.com`, whose
`gh-pages` branch root contains `github.html` and no `github/` directory; `/issues` → `200` = `/issues.html`
(501); `/index` → `200` = `/index.html` (10393); `/docs/index` → `200` = `/docs/index.html` (16549);
`/404` → `200` = `/404.html` (5445); `https://google.github.io/styleguide/htmlcssguide` → `200` =
`.html` sibling (32138).
Source (transcript): this report, Appendix A.6–A.10. Provenance of the origins: `https://api.github.com/repos/jekyll/jekyll/pages`, `https://api.github.com/repos/google/styleguide/pages`.
Verdict: **observed, undocumented**. Appending is defeated by a trailing slash (`/github/` → `404`).

**C5.7 — Directory + `index.html`: a request for `/foo` where `foo/` is a directory containing `index.html` returns `301` to `/foo/`; `/foo/` then serves `index.html`.**
Observed: `/docs` → `301` `location: https://jekyllrb.com/docs/`; `/docs/` → `200` (`16549`) identical
to `/docs/index.html`; same for `/news`, `/showcase`, `/feed`, `/docs/configuration`,
`/docs/configuration/options`. The redirect is an HTTP **301**, emitted by the origin, and its body is
162 bytes of HTML.
Source (transcript): Appendix A.11–A.16.
Verdict: **observed, undocumented**.

**C5.8 — Paths are case-sensitive, at every depth, on the `github.io` origin and under a project prefix.**
Observed: `/INDEX` → `404`; `/Docs/` → `404`; `/GitHub` → `404`; `/docs/Configuration` → `404`;
`https://google.github.io/styleguide/STYLEGUIDE` → `404`; `/docs/configuration.html` → `404`.
Source (transcript): Appendix A.17–A.22.
Verdict: **observed, undocumented for paths** (documented only for the `index.html` filename, C5.2).
This is consistent with the documented Linux-flavored caveat that Pages "URL formatting" breaks on
usernames with dashes — but that page does not state path case sensitivity:
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages (section "URL formatting on Linux")
Quote: "If the URL for your site contains a username or organization name that begins or ends with a dash, or contains consecutive dashes, people browsing with Linux will receive a server error when they attempt to visit your site."

**C5.9 — Query strings are ignored for resolution; fragments are never sent to the origin.**
Observed: `/docs/?q=1` → `200` with the same 16549 bytes as `/docs/`. `/docs#frag` → `301` to
`/docs/`, i.e. the same response as `/docs` — the fragment had no effect. The fragment rule is a
property of URIs, not of Pages:
Source: https://www.rfc-editor.org/rfc/rfc3986 (RFC 3986 §3.5)
Quote: "the fragment identifier is not used in the scheme-specific processing of a URI; instead, the fragment identifier is separated from the rest of the URI prior to a dereference, and thus the identifying information within the fragment itself is dereferenced solely by the user agent, regardless of the URI scheme."
Verdict: **query handling observed, undocumented; fragment handling is spec-defined.**

**C5.10 — The rule set, stated as a resolution algorithm (all observed, none documented).** For a request path `P` under a site's base path:
1. exact file match wins (including an extensionless file, per C5.5);
2. else, if `P` has no trailing slash and `P + ".html"` is a file → serve it with `200`;
3. else, if `P` has no trailing slash and `P` is a directory containing `index.html` → `301` to `P + "/"`, then serve `P/index.html`;
4. else → `404` with the site's 404 body (see §6).
Rule 2 is what makes `/products/flock-os` → `products/flock-os.html` work; rule 3 is what makes `/foo` → `foo/index.html` work. Rule 2 does NOT apply when a trailing slash is present.

### 5.4 What is NOT confirmed

**C5.11 — Whether the Actions-artifact deploy route (`build_type: workflow`) resolves paths identically to the legacy branch route.**
Every origin probed in Appendix A is `build_type: legacy` (`GET /repos/{o}/{r}/pages`). No primary
source states that the two build types share an origin/serving tier, and no `workflow`-built Pages
origin was probed here (doing so requires publishing a site, which this read-only task forbids).
Verdict: **`UNCONFIRMED — infer empirically`.**
Experiment: in a scratch repo, enable Pages with **Source: GitHub Actions**, run the official
`pages/static.yml` starter workflow over a tree containing `index.html`, `probe.html`,
`probe2/index.html` and a file literally named `plaintext-no-extension`; then
`curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n'` for
`/probe`, `/probe.html`, `/probe2`, `/probe2/`, `/probe2/index.html`, `/plaintext-no-extension`,
`/PROBE`. Identical results to C5.6–C5.10 mean the two routes share resolution; any divergence
(e.g. no `.html` appending) invalidates the assumption.

**C5.12 — Whether resolution ever consults the repository's files rather than the deployed artifact, and whether a `.html`-appending rule is applied to non-HTML extensions (e.g. `/foo` → `foo.xml`).**
Verdict: **`UNCONFIRMED — infer empirically`.** Experiment: as in C5.11, add `probe3.xml` and
`probe4.json` with no sibling `.html`; request `/probe3` and `/probe4` and record whether the status
is `200` (extension-agnostic appending), `404` (HTML-only), or a redirect.

**C5.13 — Practical consequence for this site (recommendation, not a documented fact).** Because rules 2 and 3 are observed only, the served tree should not rely on them for correctness. The safe layouts are: a real file at every URL you need (extensionless files are served as files the same way `.html` files are), or a directory with `index.html` at every URL that ends in `/`. Both are ordinary static trees and neither depends on an undocumented behavior — only the *convenience* of resolving `/foo` to `foo.html` does.

---

## 6. Custom 404

### 6.1 Documented — how a custom 404 page is created

**C6.1 — `404.html` (or `404.md` with `permalink: /404.html` front matter) is created inside the publishing source.** The doc gives no path other than "the publishing source", and it does not say whether the filename must be lowercase.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site
Quote:
> "In the file name field, type `404.html` or `404.md`."
> "If you named your file `404.md`, add the following YAML front matter to the beginning of the file: `--- permalink: /404.html ---`"

**C6.2 — For a workflow deploy, the published tree is the artifact, so the file must be at the artifact root; the docs state this for the entry file and the same "top level of the artifact" rule is the only placement rule the Pages docs give.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites
Quote: "If your publishing source is a GitHub Actions workflow, the artifact that you deploy must include the entry file at the top level of the artifact."
(The 404 doc itself only says "the publishing source"; applying the artifact-root rule to `404.html` is an inference from this sentence — the artifact is the publishing source for a workflow deploy.)

### 6.2 Documented — the API models whether the site has a custom 404

**C6.3 — The Pages REST API exposes `custom_404`, described as "Whether the Page has a custom 404 page", and it is a required field of the response.**
Source: https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site (response schema)
Quote: `"custom_404":{"type":"boolean","description":"Whether the Page has a custom 404 page.","default":false}` and `"required":["url","status","cname","custom_404","public"]`
This is the only first-party field that tracks a custom 404, and it is per **site** (per repository/deployment), which is consistent with what the probes in Appendix A found (C6.5).

### 6.3 The project-site trap — NOT documented, and NOT reproduced

**C6.4 — No primary source states that a project site serves the user/org site's `404.html`.** The token `404.html` occurs exactly once in the whole `github/docs` checkout (`content/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site.md`); no Pages doc, no Jekyll doc, and no changelog entry distinguishes project-site 404 lookup from user-site 404 lookup.
Source: https://github.com/github/docs (repository content; `gh api -X GET /search/code -f q='repo:github/docs "404.html"'` returned `total_count: 1` on 2026-09-14)
Verdict: the claim "a project site serves the *user/org site's* 404.html, so the project has no 404 of its own" is **widely repeated and undocumented**.

**C6.5 — Observed: the claim is false on today's platform. Each Pages site serves its OWN `/404.html` relative to its own site root, and a project site whose tree has no `404.html` falls back to a GitHub-generated generic 404 page — never to the user/org site's `404.html`.**
Three independent origins (transcript: Appendix A.29–A.36):

| request | status | bytes | identity |
|---|---|---|---|
| `https://google.github.io/404.html` (org site's own 404) | 200 | 10416 | org site file, md5 `a7e55df3…` |
| `https://google.github.io/styleguide/nonexistent-xyz` (project site) | 404 | 9379 | generic "Page not found · GitHub Pages" |
| `https://google.github.io/styleguide/404.html` | 404 | 9379 | same generic body |
| `https://deanattali.com/404.html` (user site on custom domain) | 200 | 11193 | user site file |
| `https://deanattali.com/beautiful-jekyll/nonexistent-xyz` (project site) | 404 | 9379 | generic "Page not found · GitHub Pages" |
| `https://jekyll.github.io/minima/404.html` (project site's own 404) | 200 | 6232 | project site file |
| `https://jekyll.github.io/minima/nonexistent-xyz` | 404 | 6232 | **the project site's own 404 body** |

`google/styleguide` is a distinct Pages site (`build_type: legacy`, source `gh-pages:/`,
`html_url: https://google.github.io/styleguide/`), whose `404.html` is absent from its tree — so the
org site's 10416-byte `404.html` was available and was **not** used. On `jekyll.github.io/minima/`,
where the project tree *does* contain `404.html`, that file's bytes are what unmatched paths return.
The generic bodies are identifiable by their titles: "Page not found · GitHub Pages" (9379 bytes,
shared by all project sites that lack their own `404.html`) and "Site not found · GitHub Pages"
(9115 bytes, returned when the host has no site at all).
Source (transcript): Appendix A.29–A.36.
Verdict: **observed**; the trap as described was **not reproduced**. A project site gets its own
`404.html` if it has one, and a generic GitHub 404 page if it does not.

**C6.6 — Observed: the 404 body is served with an HTTP 404 status, while `/404.html` requested directly is served as an ordinary file with HTTP 200.**
Observed: `https://jekyllrb.com/this-does-not-exist-abc` → `404` with 5445 bytes, byte-identical to
`https://jekyllrb.com/404.html` → `200` 5445 bytes. Same pattern at `google.github.io` (10416).
Source (transcript): Appendix A.23–A.25.
Verdict: **observed, undocumented**. So a custom 404 can be any HTML; it is not forced to be
"404-shaped" for the status code to be 404 — the origin supplies the status.

**C6.7 — Still `UNCONFIRMED — infer empirically`: the trap on the Actions-artifact route, and on a project site whose tree lacks `404.html` while its own user/org site has one, on the plain `github.io` host.**
The closest probe (C6.5, `google.github.io/styleguide/`) covers exactly this shape on the plain
`github.io` host and shows the generic body, not the org's file — but the org site there is a
different Pages site, and the project was `build_type: legacy`.
Experiment: create a scratch org (or use a personal account) with a user site containing a
distinctive `404.html` (e.g. body text `USER404`), plus a second repo whose Pages site is deployed by
the official starter workflow from an artifact with **no** `404.html`; then
`curl -s https://<owner>.github.io/<repo>/no-such-path | grep -c USER404` and compare with
`curl -s https://<owner>.github.io/no-such-path`. A count of `0` for the project and `1` for the
user site confirms C6.5 on the workflow route; `1` for both means the trap is real there.

---

## 7. Redirects

### 7.1 Server-side redirects are not available

**C7.1 — No primary source offers any server-side redirect configuration for Pages; there is no `_redirects`, `netlify.toml`, `.htaccess`, or header/redirect file anywhere in the Pages documentation (`_headers` and `htaccess` each occur 0 times across the `github/docs` checkout).**
Source: https://github.com/github/docs (repository content, `content/**` and `data/reusables/**`, searched 2026-09-14)
Quote: no occurrence — the absence is the evidence. The closest documented statements are C7.2 and C7.3.

**C7.2 — The documented statement that comes closest: Pages serves static files only, and does not run server-side code that could emit a redirect.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
Quote: "GitHub Pages does not support server-side languages such as PHP, Ruby, or Python."

**C7.3 — The two redirects Pages DOES document are both platform features, not site configuration: HTTP→HTTPS enforcement, and `www`→apex canonicalization.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
Quote: "You can enforce HTTPS for your GitHub Pages site to transparently redirect all HTTP requests to HTTPS."
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
Quote: "The one exception is the `www` subdomain. If configured correctly, the `www` subdomain is automatically redirected to the apex domain."

**C7.4 — Observed corroboration: a site's own redirect mechanism cannot produce a 3xx. A `jekyll-redirect-from` redirect page on a live Pages origin is served with HTTP `200` (not 301/302).**
Observed: `https://jekyllrb.com/github` → `200`, 473 bytes, body = the canonical/meta-refresh redirect page (Appendix A.37).
Verdict: **observed**.

### 7.2 The supported convention: a client-side "redirect page"

**C7.5 — The convention is an HTML file at the old URL containing a meta refresh, and the first-party Jekyll plugin for it states explicitly that no server config is generated.**
Source: https://github.com/jekyll/jekyll-redirect-from (README, "How it Works")
Quote: "Redirects are performed by serving an HTML file with an HTTP-REFRESH meta tag which points to your destination. No `.htaccess` file, nginx conf, xml file, or anything else will be generated. It simply creates HTML files."

**C7.6 — The exact markup the first-party plugin emits is the de facto convention, and it carries a canonical link, a JS fallback, a meta refresh, a `noindex` robots meta, and a visible link.**
Source: https://github.com/jekyll/jekyll-redirect-from/blob/master/lib/jekyll-redirect-from/redirect.html
Quote:
```html
<!DOCTYPE html>
<html lang="en-US">
  <meta charset="utf-8">
  <title>Redirecting&hellip;</title>
  <link rel="canonical" href="{{ page.redirect.to }}">
  <script>location="{{ page.redirect.to }}"</script>
  <meta http-equiv="refresh" content="0; url={{ page.redirect.to }}">
  <meta name="robots" content="noindex">
  <h1>Redirecting&hellip;</h1>
  <a href="{{ page.redirect.to }}">Click here if you are not redirected.</a>
</html>
```
**C7.7 — Filename convention that pairs with it (and ties back to §5): with a trailing slash → `dir/index.html`; without → a real extensionless file.**
Source: https://github.com/jekyll/jekyll-redirect-from (README, "Usage")
Quote: "Redirects including a trailing slash will generate a corresponding subdirectory containing an `index.html`, while redirects without a trailing slash will generate a corresponding `filename` without an extension, and without a subdirectory."

**C7.8 — The plugin also emits a machine-readable map of every redirect, which is useful for auditing the 67 legacy URLs.**
Source: https://github.com/jekyll/jekyll-redirect-from (README, "Disabling `redirects.json`")
Quote: "By default, a file called `redirects.json`, which can be used for automated testing or to implement server-side redirects, will be included in the output."
Observed live: `https://jekyllrb.com/redirects.json` returns `{"/news/2019/07/20/jekyll-4-0-0-pre-beta1-released/":"https://jekyllrb.com/news/2019/08/04/jekyll-4-0-0-pre-beta1-released/", …}` (Appendix A.38).

### 7.3 Is the plugin supported on Pages, and under which build type?

**C7.9 — Yes, in the branch-source Jekyll build: `jekyll-redirect-from` is in GitHub Pages' own dependency list, which the docs point to as the authoritative list of supported plugins.**
Source (docs pointing at the list): https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll (section "Plugins")
Quote: "For a list of supported plugins, see [Dependency versions](https://pages.github.com/versions.json) on the GitHub Pages site."
Source (the list itself): https://pages.github.com/versions.json
Quote: `"jekyll-redirect-from": "0.16.0"` (verified present in the JSON on 2026-09-14; 47 gems listed)

**C7.10 — The whitelist governs the Jekyll build only. Under the Actions/artifact route no Jekyll runs at all (see §11), so the plugin question is moot there: you generate the redirect files yourself and ship them in the artifact.**
Source: https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll
Quote: "GitHub Pages cannot build sites using unsupported plugins. If you want to use unsupported plugins, generate your site locally and then push your site's static files to GitHub."
(Both statements describe a Jekyll build; §11 shows the artifact route has no Jekyll step.)

### 7.4 Interaction with the 404 fallback and with search engines

**C7.11 — Undocumented, and a real hazard: nothing in any primary source connects redirect pages to the 404 mechanism. Because the origin serves a site's `404.html` for ANY unmatched path with an HTTP 404 status (C6.6), a "catch-all redirect" implemented in `404.html` produces `404` + a client-side refresh, not a redirect.**
Source: no primary statement exists; the mechanism follows from C6.6 (observed) and C7.5 (documented design of the plugin: files, not server rules).
Verdict: **`UNCONFIRMED — infer empirically`** for exact browser/search-engine treatment. Experiment: deploy a tree whose `404.html` contains only the C7.6 markup pointing at `/`, then `curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/no-such-path` (expect `404`, not `301`) and load the same URL in a browser to confirm the refresh fires despite the 404 status; check whether a crawler tooling of record treats it as a soft 404.
**Recommendation from the evidence, not from a doc:** implement the 67 legacy URLs as real files at the old paths (C7.6 markup), so each returns `200` with a canonical, rather than relying on the 404 page.

**C7.12 — Search-engine-facing markup that the first-party template deliberately includes: `rel="canonical"` to the destination and `robots: noindex` on the redirect page itself.** These are properties of the plugin's output (C7.6), quoted there. No GitHub or Jekyll primary source makes a claim about how search engines rank a `200`+meta-refresh URL; that question belongs to search-engine documentation and is **outside this report's source standard**. Verdict: **`UNCONFIRMED — infer empirically`** if a ranking claim is needed; experiment with the search engine's own URL inspection tooling.

---

---

## 8. Response headers

**8.1 — docs.github.com documents no way to set custom HTTP response headers (no CSP, X-Frame-Options, Cache-Control, Permissions-Policy, Strict-Transport-Security) for a GitHub Pages site.** The only response-header topic in the Pages docs is MIME types, and the statement there is a negative; no Pages doc mentions a `_headers` or `netlify.toml`-style mechanism.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#mime-types-on-github-pages
Quote: "A MIME type is a header that a server sends to a browser, providing information about the nature and format of the files the browser requested."

**8.2 — The one documented statement about controlling a response header on Pages is that you cannot do it per file or per repository.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#mime-types-on-github-pages
Quote: "While you can't specify custom MIME types on a per-file or per-repository basis, you can add or modify MIME types for use on GitHub Pages."

**8.3 — Whether GitHub Pages honors a `_headers` file or any other header-injection file/API: no first-party statement found.** I searched the Pages doc set, github/docs, the three Pages actions, and the GitHub Changelog for "_headers" / "custom headers" / "Content-Security-Policy" and found no first-party documentation of header control (the github/pages-gem README documents Jekyll dependency bootstrapping only). This is an absence of documentation, not a documented prohibition.
Source: https://raw.githubusercontent.com/github/pages-gem/master/README.md
Quote: "A simple Ruby Gem to bootstrap dependencies for setting up and maintaining a local Jekyll environment in sync with GitHub Pages."
Verdict: **UNCONFIRMED — infer empirically.** Experiment: place a Netlify-style `_headers` file (and a `netlify.toml`) at the root of the deployed artifact, deploy via `actions/deploy-pages`, then `curl -sSI https://<owner>.github.io/<repo>/` and diff the response headers against the same URL served without the file; also `curl -sSI` a static asset and grep for `content-security-policy`, `x-frame-options`, `cache-control`, `permissions-policy`, `strict-transport-security`.

**8.4 — No GitHub Changelog entry announcing custom response headers for GitHub Pages was found.**
Source: https://github.blog/changelog/?s=pages+headers (and the Pages-tagged changelog listing under https://github.blog/changelog/)
Result: the query returned the unfiltered Changelog index with no matching entry; no changelog item documenting a Pages header feature was found. (Search-result absence only — not a documented negative.)

**8.5 — HTML-spec fact (not a Pages fact): `<meta http-equiv>` can only express a small subset of HTTP headers.**
Source (MDN, cited here only for this generic HTML fact): https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv
Quote: "Only a subset of the HTTP headers are supported as `http-equiv` values."

**8.6 — HTML-spec fact: the supported `http-equiv` values are `content-language`, `content-type`, `content-security-policy`, `default-style`, `refresh`, `set-cookie`, and `x-ua-compatible`; `Cache-Control` and status codes are not among them.**
Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv
Quote: "Only a subset of the HTTP headers are supported as `http-equiv` values. These include:"

**8.7 — HTML-spec fact: `<meta http-equiv="set-cookie">` is ignored by browsers, so cookies cannot be set this way.**
Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv
Quote: "**set-cookie** : Sets a cookie for the document. Browsers now ignore this pragma; use the `Set-Cookie` HTTP response header or `document.cookie` instead."

**8.8 — HTML-spec fact: MDN explicitly warns that security headers must not be set via `<meta http-equiv>`, because unrecognised headers/values are ignored.**
Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv
Quote: "**Warning:** Some browsers process additional headers that are not listed above. Since unrecognized headers or invalid values are ignored, this can lead to inconsistent behavior across browser implementations. In particular, **Do not set other security headers** using `<meta http-equiv=`, as this can lead to a false sense of security!"

**8.9 — HTML-spec fact: `frame-ancestors`, `report-uri` and `sandbox` do not work in a `<meta>` CSP, and `Content-Security-Policy-Report-Only` is unsupported there; so `frame-ancestors` (the CSP equivalent of `X-Frame-Options`) cannot be delivered via `<meta>` at all.**
Source: https://w3c.github.io/webappsec-csp/#meta-element
Quote: "Note: The `Content-Security-Policy-Report-Only` header is *not* supported inside a `meta` element. Neither are the `report-uri`, `frame-ancestors`, and `sandbox` directives."

**8.10 — HTML-spec fact: when `http-equiv` is present the element is a pragma directive, and only one `meta` element per state is allowed.**
Source: https://html.spec.whatwg.org/multipage/semantics.html#pragma-directives
Quote: "When the `http-equiv` attribute is specified on a `meta` element, the element is a pragma directive."

**8.11 — Documented headers/behavior Pages itself provides: all Pages sites support HTTPS and HTTPS enforcement; sites created after June 15, 2016 on `github.io` domains are served over HTTPS automatically.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https#about-https-and-github-pages
Quote: "All GitHub Pages sites, including sites that are correctly configured with a custom domain, support HTTPS and HTTPS enforcement."

**8.12 — Enforce HTTPS is a first-party Pages setting (documented as a checkbox in Pages settings), and HTTP requests are transparently redirected to HTTPS.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
Quote: "You can enforce HTTPS for your GitHub Pages site to transparently redirect all HTTP requests to HTTPS."

**8.13 — HSTS: the only documented HSTS behavior applies to privately published sites, which are served on `*.pages.github.io` subdomains; GitHub enforces HSTS there.**
Source: https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site#about-subdomains-for-privately-published-sites
Quote: "We automatically secure every subdomain of `*.pages.github.io` with a TLS certificate, and enforce HSTS to ensure that browsers always serve the page over HTTPS."

**8.14 — Whether a public Pages site emits a `Strict-Transport-Security` response header, and whether HSTS preload is available/exposed: not documented.** The `Enforce HTTPS` docs describe HTTP→HTTPS redirection, not an HSTS header, and no Pages doc mentions HSTS preload or a way to set the header.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
Quote: "People with admin permissions for a repository can enforce HTTPS for a GitHub Pages site."
Verdict: **UNCONFIRMED — infer empirically.** Experiment: deploy the site with `Enforce HTTPS` on and run `curl -sSI https://<owner>.github.io/<repo>/` and `curl -sSI https://<custom-domain>/`, then grep for `strict-transport-security`; to test preload eligibility, check whether the header carries `preload` and whether the domain appears in the Chromium HSTS preload list.

**8.15 — Whether Pages sets its own `Cache-Control` (or `Access-Control-Allow-Origin` / `Permissions-Policy`): not documented.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#mime-types-on-github-pages
Quote: "A MIME type is a header that a server sends to a browser, providing information about the nature and format of the files the browser requested."
Verdict: **UNCONFIRMED — infer empirically.** Experiment: `curl -sSI` the HTML entry file and a hashed asset (e.g. `/assets/<sha16>.js`) and record the exact `cache-control`, `access-control-allow-origin`, `permissions-policy`, `etag`/`last-modified`, `age` and `server` headers; repeat after a redeploy to see whether cache behavior is stable.

---

## 9. Base path and custom domains

**9.1 — A project site's default URL is the owner's `github.io` host plus `/<repositoryname>`; a user/organization site's default URL is the bare `github.io` host.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#types-of-github-pages-sites
Quote (raw table cells of the docs source): "`http(s)://<owner>.github.io`" (user/organization site) and "`http(s)://<owner>.github.io/<repositoryname>`" (project site).

**9.2 — Project-site source files are documented as living in a folder inside the project repository, while user/org sites must be in a repo named `<owner>.github.io`; one Pages site per repository/account.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#types-of-github-pages-sites
Quote: "Must be stored in a repository named `<owner>.github.io`, where `<owner>` is the personal or organization account name" and "Stored in a folder within the repository that contains the project's code".

**9.3 — The naming rule for a root-serving (user/organization) site repository.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site (step 3, "Creating a repository for your site")
Quote: "If you're creating a user or organization site, your repository must be named `<user>.github.io` or `<organization>.github.io`."

**9.4 — Whether the `/<repo>/` prefix is an edge rewrite/proxy or just a subdirectory of the user site: not documented.** The docs only state the resulting URLs and that Pages is a static host; they do not describe the serving mechanism.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#about-github-pages
Quote: "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository on GitHub, optionally runs the files through a build process, and publishes a website."
Verdict: **UNCONFIRMED — infer empirically.** Experiment: deploy the same artifact to `<owner>/<repo>` and to a `<owner>.github.io` repository; request `https://<owner>.github.io/<repo>/assets/<sha16>.<ext>` and `https://<owner>.github.io/assets/<sha16>.<ext>` from each and compare status codes and bodies to determine whether the prefix is stripped, rewritten, or a literal directory.

**9.5 — `actions/configure-pages` exposes the prefix as a `base_path` output (and the host/origin/base URL), which is the first-party, machine-readable statement that a project site has a nonzero base path.**
Source: https://raw.githubusercontent.com/actions/configure-pages/main/action.yml
Quote: "base_path:
    description: 'GitHub Pages site full base path. Examples: "/my-repo" or ""'"

**9.6 — The REST representation of a Pages site exposes the site URL and the custom-domain field, but no separate base-path field in the documented response example.**
Source: https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site
Quote: "{ "url": "https://api.github.com/repos/github/developer.github.com/pages", "status": "built", "cname": "developer.github.com", "custom_404": false, "html_url": "https://developer.github.com", ... "https_enforced": true }"

**9.7 — A custom domain changes the root of the site's URL (i.e. it is served at the domain root rather than under the `github.io` host/path).**
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages
Quote: "GitHub Pages supports using custom domains, or changing the root of your site's URL from the default, like octocat.github.io, to any domain you own."

**9.8 — A custom domain can also be attached by a `CNAME` file in the published source, and it takes precedence over the repository settings value.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
Quote: "If you are publishing from a branch and your site has a CNAME file, GitHub Pages will use the domain in the CNAME file, even if you configure a custom domain in your repository settings."

**9.9 — The current docs state that a `CNAME` file alone does not add or remove a custom domain; the setting must be made in repository settings or the API.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
Quote: "A `CNAME` file in your repository file does not automatically add or remove a custom domain. Instead, you must configure the custom domain through your repository settings or through the API."

**9.10 — The exact sentence documenting a 301 redirect from `<owner>.github.io/<repo>/` to the custom domain: NOT FOUND in the current docs.** The body of "About custom domains and GitHub Pages" contains no occurrence of "redirect"; the word appears only in its `redirect_from` frontmatter, which still lists a removed article about custom-domain redirects.
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages.md
Quote (frontmatter): "- /articles/custom-domain-redirects-for-your-github-pages-site"
Verdict: **UNCONFIRMED — infer empirically.** Experiment: set the custom domain on a project repo, then run `curl -sSI https://<owner>.github.io/<repo>/` and `curl -sSI https://<owner>.github.io/<repo>/assets/<sha16>.<ext>`; record the status code (`301`?) and the `location` header, and check whether the old URL continues to serve content instead of redirecting.

**9.11 — Whether both the project-page URL and the custom domain keep working after a custom domain is set: not documented in the Pages docs.**
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages
Quote: "GitHub Pages supports using custom domains, or changing the root of your site's URL from the default, like octocat.github.io, to any domain you own."
Verdict: **UNCONFIRMED — infer empirically.** Experiment: after switching the domain, request both `https://<owner>.github.io/<repo>/` and `https://<custom-domain>/` (with `--max-redirs 0` to see the first response) and confirm which of the two returns content and which redirects.

**9.12 — Enforce HTTPS availability can take up to 24 hours after the custom domain is configured.**
Source: https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/enforce-https-custom-domain.md (included in the custom-domain configuration steps)
Quote: "Optionally, to enforce HTTPS encryption for your site, select **Enforce HTTPS**. It can take up to 24 hours before this option is available."

**9.13 — After the custom domain is configured, it can take up to an hour for the site to become available over HTTPS.**
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
Quote: "It can take up to an hour for your site to become available over HTTPS after you configure your custom domain."

**9.14 — The automatic DNS check and certificate issuance use Let's Encrypt, and the process can be restarted by removing/re-adding the domain.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https#troubleshooting-certificate-provisioning-certificate-not-yet-created-error
Quote: "When you set or change your custom domain in the Pages settings, an automatic DNS check begins. This check determines if your DNS settings are configured to allow GitHub to obtain a certificate automatically. If the check is successful, GitHub queues a job to request a TLS certificate from Let's Encrypt."

**9.15 — There is NO `cname` input on `actions/configure-pages`.** The action's `action.yml` declares exactly `static_site_generator`, `generator_config_file`, `token`, and `enablement` as inputs, at `main` and at tags v0.1.0/v0/v1/v2/v3/v4/v5 (the repo has no tag whose `action.yml` contains a `cname` or `enable_jekyll` input). Any "cname input on configure-pages" is a false premise; the CNAME concept lives in the `CNAME` file and in the REST `cname` field.
Source: https://raw.githubusercontent.com/actions/configure-pages/main/action.yml
Quote: "inputs:
  static_site_generator:
    description: 'Optional static site generator to attempt to configure: "nuxt", "next", "gatsby", or "sveltekit"'
    required: false
  generator_config_file:
    description: 'Optional file path to static site generator configuration file'
    required: false
  token:
    description: 'GitHub token'
    default: ${{ github.token }}
    required: true
  enablement:
    description: 'Try to enable Pages for the repository if it is not already enabled. This option requires a token other than `GITHUB_TOKEN` to be provided. In the context of a Personal Access Token, the `repo` scope or Pages write permission is required. In the context of a GitHub App, the `administration:write` and `pages:write` permissions are required.'
    default: 'false'
    required: false"
Also: https://api.github.com/repos/actions/configure-pages/tags — tag list ends at "v0.1.0" / "v0" (earliest), and none of those tags adds a `cname` input.

---

**9.14 — The one documented case where a project site's `/<repo>/` prefix survives onto a custom domain: when the custom domain belongs to the account's user/organization site and the project site has no custom domain of its own.**
Source: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages (section "Using a custom domain across multiple repositories")
Quote:
> "By default, if you set a custom domain for a **user site** or **organization site**, that same custom domain will be used for all project sites owned by the same account."
> "For example, if the custom domain for your user site is `www.octocat.com`, and you have a project site with no custom domain configured that is published from a repository called `octo-project`, the GitHub Pages site for that repository will be available at `www.octocat.com/octo-project`."

**C9.15 — Observed: the transition from `<owner>.github.io/...` to the custom domain is an HTTP `301`, it preserves the full path (including the project-site prefix), and it is issued for every path under the old host.**
Observed (`daattali/daattali.github.io` is `build_type: legacy`, `cname: deanattali.com`):

| request | response |
|---|---|
| `https://daattali.github.io/` | `301` → `https://deanattali.com/` |
| `https://daattali.github.io/beautiful-jekyll/` | `301` → `https://deanattali.com/beautiful-jekyll/` |
| `https://daattali.github.io/beautiful-jekyll/404.html` | `301` → `https://deanattali.com/beautiful-jekyll/404.html` |
| `https://daattali.github.io/beautiful-jekyll/nonexistent-xyz` | `301` → `https://deanattali.com/beautiful-jekyll/nonexistent-xyz` |

Two consequences: (a) the github.io URL keeps working forever, but only as a 301 — nothing stays on
the old host; (b) a project site that inherits the account's custom domain does **not** lose its
`/<repo>/` prefix, so root-absolute asset paths (`/assets/…`) break on that domain unless the site is
served at the domain root (its own custom domain, or a user/org site).
Source (transcript): Appendix A.39.
Verdict: **the 301 itself is observed and undocumented** (C9.16 below); the prefix retention is documented by C9.14.

**C9.16 — The sentence documenting a 301 from `<owner>.github.io/<repo>/` to a custom domain: still not found in the current docs — but it demonstrably happens (C9.15).** The current "About custom domains" body never uses the word "redirect"; the removed article's URL survives only in frontmatter, which indicates such a document used to exist.
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages.md
Quote: `redirect_from:` … `- /articles/custom-domain-redirects-for-your-github-pages-site`
Verdict: **documented behavior not located; behavior observed** (C9.15). Experiment for a `workflow` build type: set a custom domain on a scratch repo while a previously deployed `<owner>.github.io/<repo>/` URL exists, then `curl -sSI https://<owner>.github.io/<repo>/` and read the status and `location`.

**C9.17 — Options for hosting this site at a domain root (synthesis of C9.1–C9.16; no new source).** Any of: (a) a `<owner>.github.io` repository (documented naming rule, C9.3), which serves at the bare host; (b) a custom domain on the project repo itself, which per C9.7/C9.15 replaces the URL root with the domain — the `/<repo>/` prefix disappears; (c) a custom domain on the account's user site, which keeps the `/<repo>/` prefix (C9.14) and therefore is **not** a root-hosting option for a tree with root-absolute asset paths. Because the tree's assets are root-absolute (`/assets/<sha16>.<ext>`), only (a) or (b) is viable; (c) would rewrite the URLs of every asset.

---

---

## 10. Account/repo constraints

**10.1 — Pages plan availability: public repos on GitHub Free and Free for organizations; public and private repos on GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#who-can-use-this-feature
Quote: "GitHub Pages is available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server."

**10.2 — On GitHub Free and Free for organizations the repository must be public.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#creating-a-repository-for-your-site
Quote: "If the account that owns the repository uses GitHub Free or GitHub Free for organizations, the repository must be public."

**10.3 — A private repository CAN publish Pages on a paid plan, but the published site is public by default.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#creating-your-site
Quote: "GitHub Pages sites are publicly available on the internet, even if the repository for the site is private (if your plan or organization allows it). If you have sensitive data in your site's repository, you may want to remove the data before publishing."

**10.4 — On Enterprise Cloud the site is public by default even for private/internal repos, but can be made private via access control.**
Source: https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/private_pages_are_public_warning.md
Quote: "Unless your enterprise uses Enterprise Managed Users, GitHub Pages sites are publicly available on the internet by default, even if the repository for the site is private or internal. You can publish a site privately by managing access control for the site."

**10.5 — On GitHub Enterprise Server, whether the site is public depends on the site administrator enabling Public Pages.**
Source: https://raw.githubusercontent.com/github/docs/main/data/reusables/pages/private_pages_are_public_warning.md
Quote: "If your site administrator has enabled Public Pages, GitHub Pages sites are publicly available on the internet, even if the repository for the site is private or internal."

**10.6 — Private Pages publishing requires GitHub Enterprise Cloud.**
Source: https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site
Quote: "To publish a GitHub Pages site privately, your organization must use GitHub Enterprise Cloud."

**10.7 — Access control (private Pages) restricts access to people with read access to the publishing repository, and applies only to project sites published from private or internal org-owned repos.**
Source: https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site#about-access-control-for-github-pages-sites
Quote: "A privately published site can only be accessed by people with read access to the repository the site is published from." and "Access control is available for project sites that are published from a private or internal repository that are owned by the organization. You cannot manage access control for an organization site."

**10.8 — Organization-level "Pages creation" organization setting controls which site visibilities members may choose (Enterprise Cloud).**
Source: https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/managing-the-publication-of-github-pages-sites-for-your-organization
Quote: "You can choose to allow organization members to create publicly published sites, privately published sites, both, or neither." and "Under "Pages creation", select the visibilities you want to allow and deselect the visibilities you want to disallow."

**10.9 — Repository size recommendation: keep repositories small, ideally <1 GB, <5 GB strongly recommended.**
Source: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github#repository-size-limits
Quote: "We recommend repositories remain small, ideally less than 1 GB, and less than 5 GB is strongly recommended."

**10.10 — Repository operational limits: on-disk size 10 GB, push size enforced at 2 GB, single-object recommended limit.**
Source: https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits#repository-size
Quote: "To ensure optimal performance and manageability, we recommend staying within the following maximum limits for repository structure and size. * **On-disk size**: 10 GB" and "**Push size**: This limit is enforced at 2GB."

**10.11 — Per-file hard limit is 100 MiB (blocked); files over 50 MiB produce a Git warning but still push.**
Source: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
Quote: "GitHub blocks files larger than 100 MiB." and "If you attempt to add or update a file that is larger than 50 MiB, you will receive a warning from Git. The changes will still successfully push to your repository, but you can consider removi[ng]" (rendered sentence; the 50 MiB value comes from https://raw.githubusercontent.com/github/docs/main/data/variables/large_files.yml — "warning_size: '50 MiB'").

**10.12 — Pages-specific source-size limit: source repositories have a recommended limit of 1 GB, and published sites may be no larger than 1 GB; artifact deploys time out at 10 minutes.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
Quote: "GitHub Pages source repositories have a recommended limit of 1 GB." and "Published GitHub Pages sites may be no larger than 1 GB." and "GitHub Pages deployments will timeout if they take longer than 10 minutes."

**10.13 — Actions artifact/storage quotas (cross-reference only; Pages artifact specifics belong to item 4): Free 500 MB, Pro 1 GB, Team 2 GB, Enterprise Cloud 50 GB of artifact storage.** Relevant to a 660 MB artifact because Free/Pro/Team included artifact storage is at or below the artifact size.
Source: https://raw.githubusercontent.com/github/docs/main/data/reusables/billing/actions-included-quotas.md
Quote: "| GitHub Free | 500 MB | 2,000 | 10 GB | Not applicable |" / "| GitHub Pro | 1 GB | 3,000 | 10 GB | Not applicable |" / "| GitHub Team | 2 GB | 3,000 | 10 GB | 75 GB |" / "| GitHub Enterprise Cloud | 50 GB | 50,000 | 10 GB | 150 GB |"

**10.14 — A Pages artifact `tar` must be under 10 GB and "should not contain any symbolic or hard links"; the action's own README recommends under 1 GB.**
Source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages.md
Quote: "The GitHub Pages artifact should be a compressed `gzip` archive containing a single `tar` file. The `tar` file must be under 10GB in size and should not contain any symbolic or hard links."

**10.15 — Committing the ~660 MB `served/` tree is legal but outside the documented recommendations, and any single file over 50 MiB triggers Git warnings while any single file over 100 MiB is blocked outright.** (No documented repo-size hard block below 10 GB on-disk.)
Source: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github#repository-size-limits
Quote: "We recommend repositories remain small, ideally less than 1 GB, and less than 5 GB is strongly recommended."

---

## 11. Jekyll

**11.1 — An artifact deploy does not require Jekyll: the custom-workflow docs describe uploading a pre-built `tar` artifact and deploying it, including a "Single deploy job no building" template.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
Quote: "The `deploy-pages` action handles the necessary setup for deploying artifacts." and (workflow comment) "# Single deploy job no building".

**11.2 — When you deploy an artifact, the artifact is the site: the entry file must be at the top level of the artifact, and the workflow need not run any build.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#creating-your-site
Quote: "If your publishing source is a GitHub Actions workflow, the artifact that you deploy must include the entry file at the top level of the artifact. Instead of adding the entry file to your repository, you may choose to have your GitHub Actions workflow generate your entry file when the workflow runs."

**11.3 — Jekyll is documented as running only when you publish from a source branch.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#static-site-generators
Quote: "If you publish your site from a source branch, GitHub Pages will use Jekyll to build your site by default. If you want to use a static site generator other than Jekyll, we recommend that you write a GitHub Actions to build and publish your site instead."

**11.4 — What `.nojekyll` does: it disables the Jekyll build process for branch-based publishing.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#static-site-generators
Quote: "Otherwise, disable the Jekyll build process by creating an empty file called `.nojekyll` in the root of your publishing source, then follow your static site generator's instructions to build your site locally."

**11.5 — There is NO `enable_jekyll` input on `actions/configure-pages`.** The input does not exist at `main` or at any release tag, and the `configure-pages` action.yml declares no Jekyll-related input at all (its inputs are `static_site_generator`, `generator_config_file`, `token`, `enablement`). The `enable_jekyll` name belongs to a third-party Pages deploy action, not to GitHub's own Pages actions; there is no GitHub-maintained `enable_jekyll` input to configure.
Source: https://raw.githubusercontent.com/actions/configure-pages/main/action.yml
Quote: "name: 'Configure GitHub Pages'
description: 'A GitHub Action to enable Pages, extract various metadata about a site, and configure some supported static site generators.'"

**11.6 — Is a `.nojekyll` file needed INSIDE the artifact for a plain static tree deployed via Actions?** No first-party source states that it is needed or that it is unnecessary. The only `.nojekyll` documentation is scoped to "If you publish your site from a source branch"; the `upload-pages-artifact` README/action.yml and the `configure-pages` README/action.yml never mention Jekyll or `.nojekyll`.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
Quote: "name: "Upload GitHub Pages artifact"
description: "A composite action that prepares your static assets to be deployed to GitHub Pages""
Verdict: **UNCONFIRMED — infer empirically.** Experiment: deploy the same artifact twice, once with an empty `.nojekyll` at the artifact root and once without (and with `include-hidden-files: true` so the dotfile survives), then `curl -sI` the entry file and an `_`-prefixed asset (e.g. `/_next/static/x.js`) in both deploys and compare status codes and bodies.

**11.7 — CRITICAL, documented behavior of the artifact action: hidden files/directories (names starting with a dot, e.g. `.nojekyll`, `.well-known`) are excluded from the Pages artifact by default.** This is enforced by the tar invocation (`--exclude=.[^/]*`) and exposed as the `include-hidden-files` input; `.git` and `.github` are always excluded.
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/action.yml
Quote: "include-hidden-files:
    description: "Include hidden files and directories (those starting with a dot) in the artifact. Excludes .git and .github regardless."
    required: false
    default: "false"" and (archive step) "--exclude=.git \
          --exclude=.github \
          ${{ inputs.include-hidden-files != 'true' && '--exclude=.[^/]*' || '' }} \"

**11.8 — Consequence: to ship `.well-known/` (or any dot-prefixed path) in a Pages artifact you must set `include-hidden-files: true`.**
Source: https://raw.githubusercontent.com/actions/upload-pages-artifact/main/README.md
Quote: "| `include-hidden-files` | `false` | `false` | Include hidden files and directories (those starting with a dot) in the artifact. Excludes `.git` and `.github` regardless. |"

**11.9 — Jekyll's own ignore rules (applicable only where Jekyll runs): files/dirs starting with `_`, `.`, `#` or `~` are not copied to the destination unless explicitly included; these are Jekyll defaults, overridable with `include:` / `exclude:`.**
Source: https://jekyllrb.com/docs/structure/
Quote: "Every file or directory beginning with the following characters: `.`, `_`, `#` or `~` in the `source` directory will not be included in the `destination` folder. Such paths will have to be explicitly specified via the config file in the `include` directive to make sure they’re copied over:"

**11.10 — Jekyll 4's `include` overrides the default exclusion list; `exclude` matches glob patterns; `keep_files` preserves destination files when the destination is clobbered.**
Source: https://jekyllrb.com/docs/configuration/options/
Quote: "In Jekyll 4, user-provided entries get added to the default exclusion list instead and the `include` option can be used to override the default exclusion list entries." and "When clobbering the site destination, keep the selected files. Useful for files that are not generated by jekyll; e.g. files or assets that are generated by your build tool. The paths are relative to the `destination`."

**11.11 — GitHub docs state the same Jekyll default ignore list, including `_`/`.`/`#` prefixes, `~` suffixes, `/node_modules` and `/vendor`, and `exclude`.**
Source: https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll
Quote (docs source): "ld files or folders that: * Are located in a folder called `/node_modules` or `/vendor` * Start with `_`, `.`, or `#` * End with `~` * Are excluded by the `exclude` setting in your configura[tion file]" (must_contain excerpt).

**11.12 — Whether Jekyll's ignore rules can affect an Actions artifact deploy: they can only apply where Jekyll runs, and the Pages docs scope Jekyll (and `.nojekyll`) to branch-based publishing.** The artifact deployed by `actions/deploy-pages` is a pre-built `tar` produced by `upload-pages-artifact`; `tar` ignores nothing based on leading `_` or `.` except the explicit dotfile exclusion above. No first-party doc explicitly states "Jekyll ignore rules do not apply to artifact deployments".
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#static-site-generators
Quote: "If you publish your site from a source branch, GitHub Pages will use Jekyll to build your site by default."
Verdict: **UNCONFIRMED (the categorical "no effect" claim) — infer empirically.** Experiment: publish an artifact containing `_next/x.js`, `.well-known/y`, `_pages/z.html` and `#a#`, `b~` with `include-hidden-files: true`; then `curl -sI https://<owner>.github.io/<repo>/_next/x.js`, `/.well-known/y`, `/_pages/z.html`, `/%23a%23`, `/b~` and confirm each returns 200 with the exact bytes. `_next` and other `_`-prefixed paths should survive because `upload-pages-artifact` excludes only `.`-prefixed entries; dotfile paths should survive only with `include-hidden-files: true`.

**11.13 — Note on relative/absolute paths: the `.nojekyll`/Jekyll exclusion behavior is separate from URL rewriting.** All Pages docs statements about where a file becomes available express it as the same directory structure as the publishing source, so no base-path rewriting is applied by the artifact path.
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#next-steps
Quote: "Each file will be available on your site in the same directory structure as your publishing source."

---

## 12. Large-site gotchas

**C12.1 — Artifact upload duration / upload timeout: no documented upload timeout or size warning exists for the upload step; the only duration limit documented is the 6-hour job limit and the 10-minute Pages deployment timeout.**
Source: https://docs.github.com/en/actions/reference/limits
> "| All GitHub-hosted runners | Job execution time | 6 hours | Each job in a workflow can run for up to 6 hours of execution time. If a job reaches this limit, the job is terminated a… |  |"
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages deployments will timeout if they take longer than 10 minutes."
> `UNCONFIRMED — infer empirically` for an upload-step timeout sized for ~660 MB. Experiment: run the workflow in a test repo with a ~660 MB artifact and observe the "Upload artifact" step: if there is a server-side deadline it will surface as a failed step with a message such as a 4xx/5xx from the artifacts service; record the elapsed time and the exact message. If it completes, the bound is at least that duration.

**C12.2 — The documented concurrency mechanism for Pages deployments is the Actions `concurrency` group in the starter workflow: group `"pages"`, `cancel-in-progress: false`.**
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/static.yml
> ```
> # Allow only one concurrent deployment, skipping runs queued between the run in-progress and latest queued.
> # However, do NOT cancel in-progress runs as we want to allow these production deployments to complete.
> concurrency:
>   group: "pages"
>   cancel-in-progress: false
> ```

**C12.3 — The same concurrency group is used by the other Pages starter workflows, so the behavior is consistent across templates.**
Source: https://raw.githubusercontent.com/actions/starter-workflows/main/pages/jekyll-gh-pages.yml
> ```
> # Allow only one concurrent deployment, skipping runs queued between the run in-progress and latest queued.
> # However, do NOT cancel in-progress runs as we want to allow these production deployments to complete.
> concurrency:
>   group: "pages"
>   cancel-in-progress: false
> ```

**C12.4 — With `cancel-in-progress: false`, previously PENDING (queued) runs in the same group are still cancelled/replaced; only in-progress runs are protected.**
Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
> "When a concurrent job or workflow is queued, if another job or workflow using the same concurrency group in the repository is in progress, the queued job or workflow will be `pending`. By default, any existing `pending` job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place."

**C12.5 — Ordering of queued runs is FIFO but explicitly NOT guaranteed.**
Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
> "Jobs or workflow runs in the same concurrency group are processed in first-in-first-out (FIFO) order according to the time each one started waiting on the concurrency group, not the time each workflow was dispatched. Since the actual start time of a job or run may vary, ordering is not guaranteed."

**C12.6 — The `queue` property changes that: `single` (default, one pending) vs `max` (up to 100 pending, then cancel). The starter workflows do not set `queue`.**
Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
> "- `single` (default): At most one job or workflow run can be `pending` in the concurrency group. When a new job or workflow run is queued, any existing `pending` job or workflow run in the same group is canceled and replaced.
> - `max`: Up to 100 jobs or workflow runs can be `pending` in the concurrency group. When the queue is full, any additional jobs or workflow runs are canceled."

**C12.7 — Platform-side (non-Actions) Pages deployment queueing — i.e. a GitHub-side queue of Pages deployments independent of Actions concurrency — is not documented on the Pages docs or the Pages limits page.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
> (The page documents only the rate-limit/429 sentence and the 10-minute timeout; nothing about deployment queuing.)
> `UNCONFIRMED — infer empirically`: whether two deploys created via `POST /repos/{owner}/{repo}/pages/deployments` are queued or one is rejected. Experiment: fire two deployment creations back-to-back via the REST API (or two workflow runs with the concurrency group removed) and inspect each deployment's status via `GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}` — see whether the second returns `deployment_in_progress` concurrently, is rejected with a 4xx, or is auto-cancelled (`deployment_cancelled`).

**C12.8 — CDN cache behavior (TTL / purge): GitHub Pages documentation has NO page documenting a CDN cache TTL or a purge mechanism.**
Source: https://api.github.com/repos/github/docs/contents/content/pages (directory listing of the whole Pages docs subtree)
> Full Pages content tree = `content/pages/index.md`, `content/pages/quickstart.md`, `content/pages/getting-started-with-github-pages/` (12 files incl. `github-pages-limits.md`, `configuring-a-publishing-source-for-your-github-pages-site.md`, `using-custom-workflows-with-github-pages.md`, `changing-the-visibility-of-your-github-pages-site.md`), `content/pages/configuring-a-custom-domain-for-your-github-pages-site/` (4 files incl. `managing-a-custom-domain-for-your-github-pages-site.md`, `securing-your-github-pages-site-with-https.md`, `troubleshooting-custom-domains-and-github-pages.md`, `verifying-your-custom-domain-for-github-pages.md`), `content/pages/setting-up-a-github-pages-site-with-jekyll/` (Jekyll guides). No file name references caching.
> (Rendered index: https://docs.github.com/en/pages — 24 articles, none about caching.)

**C12.9 — The only CDN reference in the Pages limits docs is a *suggestion to put a third-party CDN in front of the site*, which is evidence there is no documented built-in cache-control/purge feature to describe.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "…including putting a third-party content distribution network (CDN) in front of your site…"

**C12.10 — Documented cache TTL/purge:**
Source: (absence in the Pages docs tree, C12.8–C12.9)
> `UNCONFIRMED — infer empirically`: deploy the site, then `curl -I https://<owner>.github.io/<repo>/<asset>` twice and record `cache-control`, `age`, `etag`/`last-modified`, and `x-cache`/`x-served-by` headers; change the asset and redeploy; re-fetch immediately and then at intervals (1 min, 5 min, 1 h) and compare the `etag`/body hash to the newly deployed bytes. The point at which the body flips is the effective TTL. Note that if no `cache-control`/`age` header is returned, no TTL can be inferred from headers at all.

**C12.11 — Deploy rate limits: the Pages limits page constrains RATE (HTTP 429), not a count of Pages deployments per hour. No per-hour Pages-deploy quota is documented.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "In order to provide consistent quality of service for all GitHub Pages sites, rate limits may apply. These rate limits are not intended to interfere with legitimate uses of GitHub Pages. If your request triggers rate limiting, you will receive an appropriate response with an HTTP status code of `429`, along with an informative HTML body."

**C12.12 — The 10 builds/hour figure is explicitly NOT a deploy limit for the Actions route, so a workflow-driven 660 MB site is not subject to it.**
Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits#usage-limits
> "GitHub Pages sites have a *soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."

**C12.13 — The Pages deployment-creation endpoint can return a spam/validation rejection, which is the only documented per-request throttle signal on the deploy endpoint.**
Source: https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment (HTTP response status codes)
> "| 422 | Validation failed, or the endpoint has been spammed. |"

**C12.13b — The polling loop in `deploy-pages` authenticates with `GITHUB_TOKEN`, whose documented primary rate limit is 1,000 requests per hour per repository — a real ceiling for a slow 660 MB deploy that also triggers other API calls. The action's own poll cadence starts at 5 s and backs off.**
Source: https://docs.github.com/en/actions/reference/limits#commonly-hit-dependent-service-limits
> "- **GITHUB TOKEN** - The rate limit for `GITHUB_TOKEN` is 1,000 requests per hour per repository. For requests to resources that belong to a GitHub Enterprise Cloud account, the limit is 15,000 requests per hour per repository."
> (The `GITHUB TOKEN` label is rendered from a bolded token name in the source; the substantive sentence, quoted verbatim, is "The rate limit for `GITHUB_TOKEN` is 1,000 requests per hour per repository.")
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/action.yml
> ```
>   reporting_interval:
>     description: 'Initial time between deployment status reports; successful polls use capped backoff and jitter, with error backoff added separately (default: 5 seconds)'
>     required: false
>     default: '5000'
> ```
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const MAX_REPORTING_INTERVAL = 30000
> const REPORTING_BACKOFF_MULTIPLIER = 1.5
> ```

**C12.14 — Documented limit on Pages deployments per hour:**
Source: (absence — C12.11–C12.13 cover the only documented throttles)
> `UNCONFIRMED — infer empirically`: trigger N deploys in one hour (suggested N = 10, 20, 40) by re-running the deploy workflow in a test repo and record, per run, the HTTP status of `POST /repos/{owner}/{repo}/pages/deployments` (visible in the deploy-pages log as "Creating Pages deployment failed") plus the resulting Pages deployment status. The first N at which a 403/422/429 appears is the boundary.

**C12.14b — Secondary rate limits apply to the API calls the deploy path makes, and are not configurable.**
Source: https://docs.github.com/en/actions/reference/limits#commonly-hit-dependent-service-limits
> "**Secondary rate limits** - In addition to primary rate limits, GitHub enforces secondary rate limits in order to prevent abuse and keep the API available for all users, these are not configurable with GHEC. For more information, see Rate limits for the REST API."

**C12.15 — The Pages deployment `status` values are enumerated in the OpenAPI schema `pages-deployment-status` (title "GitHub Pages deployment status"), which is what the REST reference is generated from. The documented set is: `deployment_in_progress`, `syncing_files`, `finished_file_sync`, `updating_pages`, `purging_cdn`, `deployment_cancelled`, `deployment_failed`, `deployment_content_failed`, `deployment_attempt_error`, `deployment_lost`, `succeed`.**
Source: https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json (components/schemas/pages-deployment-status)
> ```
> "enum": [ "deployment_in_progress", "syncing_files", "finished_file_sync", "updating_pages", "purging_cdn", "deployment_cancelled", "deployment_failed", "deployment_content_failed", "deployment_attempt_error", "deployment_lost", "succeed" ]
> ```
> Retrieval note: the file is ~12.9 MB and each `must_contain` probe returns only a short window, so this array was captured by four overlapping verbatim excerpts of the same single `enum` value list (`deployment_in_progress`…, `finished_file_sync`…, `deployment_failed`…, `deployment_lost`…) and concatenated. The schema is named in the file as `"pages-deployment-status": { "title": "GitHub Pages deployment status", "type": "object", "properties": { "status": { "ty…`.

**C12.16 — The rendered REST reference does NOT enumerate those statuses; it only shows one example value. So the status list above is documented in the OpenAPI source but not surfaced as prose on docs.github.com.**
Source: https://docs.github.com/en/rest/pages/pages#get-the-status-of-a-github-pages-deployment
> `#### Response`
> `{ "status": "succeed" }`

**C12.17 — `deployment_in_progress`, `syncing_files`, `finished_file_sync`, `updating_pages` and `purging_cdn` are non-terminal states: `deploy-pages` merely logs them and keeps polling, so a long "purging_cdn"/"updating_pages" phase is invisible as an error and can only end in success, a mapped failure, or the 10-minute timeout.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
>         } else if (temporaryErrorStatus[deployment.status]) {
>           // A temporary error happened, will query the status again
>           core.warning(temporaryErrorStatus[deployment.status])
>         } else {
>           core.info('Current status: ' + deployment.status)
>         }
> ```
> ("Current status: …" is `core.info` — informational, not an error.)

**C12.18 — There IS a documented failure mode a workflow will not surface as an error immediately: `deployment_attempt_error` is treated as temporary and only warned, then retried; the run can therefore look healthy while the deployment is erroring, until the timeout or a terminal status arrives.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const temporaryErrorStatus = {
>   unknown_status: 'Unable to get deployment status.',
>   not_found: 'Deployment not found.',
>   deployment_attempt_error: 'Deployment temporarily failed, a retry will be automatically scheduled...'
> }
> ```

**C12.19 — The terminal failure statuses and their exact user-visible messages (these are what a failed large deploy looks like).**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
> const finalErrorStatus = {
>   deployment_failed: 'Deployment failed, try again later.',
>   deployment_content_failed:
>     'Artifact could not be deployed. Please ensure the content does not contain any hard links, symlinks and total size is less than 10GB.',
>   deployment_cancelled: 'Deployment cancelled.',
>   deployment_lost: 'Deployment failed to report final status.'
> }
> ```

**C12.20 — A deploy that never gets a status at all is surfaced only via the temporary maps, e.g. `unknown_status` / `not_found`, when the action cannot find its own deployment record.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
>     if (!this.deploymentInfo) {
>       core.setFailed(temporaryErrorStatus.not_found)
>       return
>     }
>     if (this.deploymentInfo.pending !== true) {
>       core.setFailed(temporaryErrorStatus.unknown_status)
>       return
>     }
> ```

**C12.21 — Does `deploy-pages` fail or truncate when the artifact cannot be extracted within its timeout? It FAILS (and explicitly cancels) with the exact message "Timeout reached, aborting!" — it does not truncate.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
>       // Handle timeout
>       if (Date.now() - this.startTime >= this.timeout) {
>         core.error('Timeout reached, aborting!')
>         core.setFailed('Timeout reached, aborting!')
>
>         // Explicitly cancel the deployment
>         await this.cancel()
>         return
>       }
> ```

**C12.22 — The cancel-on-timeout is a real API call to the cancel endpoint, so a timed-out large deploy ends in `deployment_cancelled` (or is left as-is if cancellation itself fails, in which case the cancel error is what fails the step).**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
>       const deploymentId = this.deploymentInfo.id || this.buildVersion
>       await cancelPagesDeployment({
>         githubToken: this.githubToken,
>         deploymentId
>       })
>       core.info(`Canceled deployment with ID ${deploymentId}`)
> ```
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/api-client.js
> `const response = await octokit.request('POST /repos/{owner}/{repo}/pages/deployments/{deploymentId}/cancel', {`

**C12.23 — There is a second abort path for large/slow deploys: repeated API errors against the deploy endpoint abort with "Too many errors, aborting!" and the HTTP status, after `error_count` (default 10) errors.**
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/src/internal/deployment.js
> ```
>       if (errorCount >= maxErrorCount) {
>         core.error('Too many errors, aborting!')
>         core.setFailed('Failed with status code: ' + errorStatus)
> ```
Source: https://raw.githubusercontent.com/actions/deploy-pages/main/action.yml
> ```
>   error_count:
>     description: 'Maximum number of status report errors before cancelling a deployment (default: 10)'
>     required: false
>     default: '10'
> ```

**C12.24 — Whether the platform truncates an artifact that exceeds the timeout mid-extraction (rather than failing the deployment):**
Source: (absence; the action only knows the enumerated statuses, and the only size-related outcome documented anywhere is C12.19's `deployment_content_failed` reason string)
> `UNCONFIRMED — infer empirically`: upload a ~5–9 GB Pages artifact (under the documented 10 GB unofficial absolute max, above the 10-minute deploy window) in a test repo and, after the deploy, fetch a deterministic asset and compare its bytes to the source file. Truncation would show as a short/partial file with HTTP 200; a clean failure would show as exit code 1 with "Timeout reached, aborting!" or `deployment_content_failed`/`deployment_failed` in the step log.

**C12.25 — A documented, platform-side build queue DOES exist for branch-source builds: one concurrent build per repository and one per requester, with later requests queued. It is documented on the "Request a GitHub Pages build" endpoint, i.e. it governs `POST .../pages/builds`, not Actions-workflow deploys.**
Source: https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build
Quote: "Build requests are limited to one concurrent build per repository and one concurrent build per requester. If you request a build while another is still in progress, the second request will be queued until the first completes."
(The build status object for that endpoint has only `queued` and `built`-style values, e.g. the documented example `{ "url": "…/pages/builds/latest", "status": "queued" }`, which is why a queued branch build is observable but exposes no progress detail.)

**C12.26 — Observed: the CDN TTL is 10 minutes (`cache-control: max-age=600`) plus an `expires` header, with Fastly-fronted caching (`via: 1.1 varnish`, `x-cache: HIT`, `age`), and a documented deployment phase (`purging_cdn`, C12.15) implies a purge happens on deploy — but the TTL/purge is nowhere documented, and no user-facing purge control exists.**
Source (documented phase name): https://docs.github.com/en/rest/pages/pages#get-a-github-pages-deployment-status — status enum includes `purging_cdn` (see C12.15 for the full string).
Source (absence of a TTL/purge doc): https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits — no cache TTL or purge setting appears anywhere in the Pages docs (C12.8).
Quote (transcript): `cache-control: max-age=600`, `expires: Mon, 14 Sep 2026 03:58:24 GMT`, `via: 1.1 varnish`, `age: 517`, `x-cache: HIT`, `x-served-by: cache-iad-kiad7000170-IAD`, `server: GitHub.com` (Appendix A, section I).
Verdict: **TTL is observed, not documented; the purge is documented only as a status name.** Practical consequence: after a deploy, an edge node may keep serving the previous bytes for up to ~10 minutes, and no purge can be requested by the site owner. To measure it for this site: deploy, then `curl -sI https://<host>/assets/<sha16>.js` and record `age`/`cache-control`; redeploy changed bytes for the same path and re-fetch until the body flips.

---

# Appendix A — empirical probe transcript (the basis of every "observed" claim)

Reproduce with the commands shown; no repository was modified. Provenance for each origin was
confirmed with `GET /repos/{owner}/{repo}/pages` before probing.

Run date: 2026-09-14. All probes are plain `curl` from this machine; no repo was modified.
Purpose: separate DOCUMENTED behavior from OBSERVED behavior for URL resolution (item 5),
custom 404 (item 6), redirects (item 7), base path / custom domain (item 9), CDN (item 12).

## Provenance of each probed origin (via GitHub REST `GET /repos/{o}/{r}/pages`)

| origin | repo | build_type | cname | source | html_url |
|---|---|---|---|---|---|
| jekyllrb.com | jekyll/jekyll | legacy | jekyllrb.com | gh-pages:/ | http://jekyllrb.com/ |
| octocat.github.io | octocat/octocat.github.io | legacy | null | master:/ | http://octocat.github.io/ |
| daattali.github.io / deanattali.com | daattali/daattali.github.io | legacy | deanattali.com | master:/ | https://deanattali.com/ |
| deanattali.com/beautiful-jekyll/ | daattali/beautiful-jekyll | legacy | null | gh-pages:/ | http://deanattali.com/beautiful-jekyll/ |
| jekyll.github.io/minima/ | jekyll/minima | legacy | null | gh-pages:/ | http://jekyll.github.io/minima/ |
| jekyll.github.io/jekyll-seo-tag/ | jekyll/jekyll-seo-tag | legacy | null | master:/docs | http://jekyll.github.io/jekyll-seo-tag/ |
| google.github.io/ | (org site) | — | — | — | 200, org site exists |
| google.github.io/styleguide/ | google/styleguide | legacy | null | gh-pages:/ | https://google.github.io/styleguide/ |
| pages-themes.github.io/minimal/ | pages-themes/minimal | legacy | null | master:/ | https://pages-themes.github.io/minimal/ |
| pages-themes.github.io/cayman/ | pages-themes/cayman | legacy | null | master:/ | https://pages-themes.github.io/cayman/ |

## A. Extension appending (`/foo` -> `foo.html`) — OBSERVED, undocumented

Repo file layout verified first: `jekyll/jekyll` @ `gh-pages` root contains `github.html`,
`issues.html`, `index.html`, `404.html` and NO `github/`, `issues/`, `404/` directories.
`google/styleguide` @ `gh-pages` contains `htmlcssguide.html`.

```
200||473   <- https://jekyllrb.com/github
200||473   <- https://jekyllrb.com/github.html
200||501   <- https://jekyllrb.com/issues
200||501   <- https://jekyllrb.com/issues.html
200||5445  <- https://jekyllrb.com/404
200||5445  <- https://jekyllrb.com/404.html
200||10393 <- https://jekyllrb.com/index
200||10393 <- https://jekyllrb.com/index.html
200||16549 <- https://jekyllrb.com/docs/index
200||16549 <- https://jekyllrb.com/docs/index.html
200||32138 <- https://google.github.io/styleguide/htmlcssguide
200||32138 <- https://google.github.io/styleguide/htmlcssguide.html
404||5445  <- https://jekyllrb.com/docs/configuration.html   # no such file
404||5445  <- https://jekyllrb.com/github/                   # trailing slash defeats it
404||5445  <- https://jekyllrb.com/docs/index/               # trailing slash defeats it
```
Same byte counts for the pair == same body served. Appending works at the site root, in a
subdirectory (`/docs/index`), and under a project prefix (`/styleguide/htmlcssguide`).

## B. Directory + index.html — OBSERVED, undocumented (301 to trailing slash)

```
301|https://jekyllrb.com/docs/|162                   <- https://jekyllrb.com/docs
301|https://jekyllrb.com/news/|162                   <- https://jekyllrb.com/news
301|https://jekyllrb.com/showcase/|162               <- https://jekyllrb.com/showcase
301|https://jekyllrb.com/feed/|162                   <- https://jekyllrb.com/feed
301|https://jekyllrb.com/docs/configuration/|162     <- https://jekyllrb.com/docs/configuration
301|https://jekyllrb.com/docs/configuration/options/|162 <- https://jekyllrb.com/docs/configuration/options
200||16549 <- https://jekyllrb.com/docs/              # same bytes as /docs/index.html
```
The 301 is emitted when the extensionless path is a DIRECTORY containing index.html; the
redirect target is the path + `/`, and it is a 301 (permanent).

## C. Case sensitivity — OBSERVED (undocumented for paths; the one documented case rule is index.html's filename)

```
404||5445 <- https://jekyllrb.com/INDEX
404||5445 <- https://jekyllrb.com/Docs/
404||5445 <- https://jekyllrb.com/GitHub
404||5445 <- https://jekyllrb.com/docs/Configuration
404||9379 <- https://google.github.io/styleguide/STYLEGUIDE
404||9379 <- https://google.github.io/styleguide/HTMLCSSGUIDE
404      <- https://pages.github.com/INDEX.HTML
```

## D. Query string and fragment

```
200||16549 <- https://jekyllrb.com/docs/?q=1     # identical to /docs/
301|https://jekyllrb.com/docs/|162 <- https://jekyllrb.com/docs#frag   # fragment never sent
```

## E. Missing paths -> 404 status with a 404 body

```
404||5445 <- https://jekyllrb.com/this-does-not-exist-abc
404||5445 <- https://jekyllrb.com/this-does-not-exist-abc/
200|5445  <- https://jekyllrb.com/404.html        # the same bytes, served as a file with 200
```
`/404.html` requested directly is a normal static file (HTTP 200); the identical bytes are
returned with HTTP 404 for unmatched paths. Same pattern at google.github.io (10416).

## F. Custom 404 per site — the "project site serves the org's 404.html" claim is NOT reproduced

```
# org site has its own 404.html ...
200|10416 <- https://google.github.io/404.html
# ... but its project site does NOT get it: project has no 404.html of its own
404|9379  <- https://google.github.io/styleguide/404.html
404|9379  <- https://google.github.io/styleguide/nonexistent-xyz
# google/styleguide IS a distinct project Pages site (build_type legacy, gh-pages branch)

# user site with a custom 404.html on a custom domain ...
200|11193 <- https://deanattali.com/404.html
# ... project site under the same domain still gets the generic page
404|9379  <- https://deanattali.com/beautiful-jekyll/404.html
404|9379  <- https://deanattali.com/beautiful-jekyll/nonexistent-xyz

# project site that HAS its own 404.html serves its own
200|6232  <- https://jekyll.github.io/minima/404.html
404|6232  <- https://jekyll.github.io/minima/nonexistent-xyz

# project sites with no 404.html of their own -> GitHub's generic body
404|9379  <- https://pages-themes.github.io/minimal/nonexistent-xyz
404|9379  <- https://pages-themes.github.io/minimal/404.html
404|9379  <- https://jekyll.github.io/jekyll-seo-tag/nonexistent-xyz
# md5 c1f9838a645648cb3b25359f7890a288 == "Page not found · GitHub Pages", shared by all of the above
# md5 of https://google.github.io/404.html is a7e55df34624a1241c2e79ee1d0a2705 -> never used by the project site
```
Bodies inspected: missing paths on a site with no 404.html return a body titled
"Page not found · GitHub Pages"; a non-existent user/org site returns
"Site not found · GitHub Pages" (9115 bytes).

## G. Client-side redirect page really is HTTP 200

`https://jekyllrb.com/github` (473 bytes, HTTP 200) body:
```html
<!DOCTYPE html>
<html lang="en-US">
  <meta charset="utf-8">
  <title>Redirecting&hellip;</title>
  <link rel="canonical" href="https://github.com/jekyll/jekyll">
  <script>location="https://github.com/jekyll/jekyll"</script>
  <meta http-equiv="refresh" content="0; url=https://github.com/jekyll/jekyll">
```
(truncated at the refresh meta tag; the file also has `<meta name="robots" content="noindex">`)

## H. Custom domain 301 keeps the project prefix

```
301|https://deanattali.com/|162                       <- https://daattali.github.io/
301|https://deanattali.com/beautiful-jekyll/|162      <- https://daattali.github.io/beautiful-jekyll/
301|https://deanattali.com/beautiful-jekyll/404.html|162 <- https://daattali.github.io/beautiful-jekyll/404.html
301|https://deanattali.com/beautiful-jekyll/nonexistent-xyz|162 <- https://daattali.github.io/beautiful-jekyll/nonexistent-xyz
```
Every path under the github.io origin is 301'd to the same path on the custom domain —
including a project site's `/<repo>/` prefix, i.e. the prefix is NOT stripped when the
project site inherits the user site's custom domain.

## I. Response headers observed on a Pages origin (CDN/caching evidence for item 12)

```
$ curl -sI https://jekyllrb.com/
HTTP/2 200
server: GitHub.com
content-type: text/html; charset=utf-8
last-modified: Mon, 22 Jun 2026 16:20:48 GMT
access-control-allow-origin: *
etag: "6a3960e0-2899"
expires: Mon, 14 Sep 2026 03:58:24 GMT
cache-control: max-age=600
x-proxy-cache: MISS
x-github-edge-region: iad
accept-ranges: bytes
via: 1.1 varnish
age: 517
x-served-by: cache-iad-kiad7000170-IAD
x-cache: HIT
x-cache-hits: 1

$ curl -sI https://jekyllrb.com/docs
HTTP/2 301
location: https://jekyllrb.com/docs/
cache-control: max-age=600
x-proxy-cache: MISS
```
No `Strict-Transport-Security` on this HTTP/2 response; no way to add headers from the site
(tree). `cache-control: max-age=600` = a 10-minute edge TTL, observed, not documented.


---

*End of report. Item numbering matches the research request; "DOCUMENTED", "OBSERVED", and "`UNCONFIRMED — infer empirically`" are used strictly as defined at the top.*
