# 07: Option C — publish this repo at the project URL under the porkbun domain

**What to build:** The site is published from **this** repository
(`interactive-media-production`), unchanged in name, and reaches a working URL
root by attaching the maintainer's porkbun custom domain to this repository's
Pages site. The domain replaces the site's URL root, so the `/interactive-media-production/`
prefix disappears and the tree's root-absolute references resolve. The default
project URL is accepted as non-functional and is not used.

**Blocked by:** None (can start immediately). **Chosen 2026-09-14** over the
alternative 03 (user-site repo), which was closed as not taken.

**Status:** resolved

- [x] Porkbun DNS points the domain at GitHub Pages (apex records at the Pages
      IPs, `www` as a CNAME to the Pages host) and the records have propagated.
- [x] This repository's Pages source is set to **GitHub Actions**, and the custom
      domain is set through repository settings/API — not only a `CNAME` file.
- [x] "Enforce HTTPS" is on and the certificate state is **approved**, so both
      `http` and `https` resolve to `https`.
- [x] `https://<domain>/` renders the homepage with its styles, images and
      media, and a sampled deep route resolves as a page.
- [x] DNS propagation is confirmed from a client that has never resolved the
      domain, not only from this machine's cache.
- [x] What the old `https://jennymaeleidig.github.io/interactive-media-production/…`
      URLs do after attachment is measured and recorded: if they 404 rather than
      reaching the corresponding page, that is written down as the accepted cost
      of this option (the user-site option is the one that keeps a useful
      `github.io` fallback).
- [x] The project remains one repository with one workflow; no rename and no
      second repository.

## Comments

**Domain: `flocksafety.cam`**, registered at Porkbun (RDAP: Porkbun LLC) on
Porkbun's own nameservers, so its records live in Porkbun's DNS editor — not at
Cloudflare. Porkbun's nameservers sit on Cloudflare's network and the zone's SOA
contact reads `dns.cloudflare.com`; that is Porkbun's infrastructure, not a
separate Cloudflare account. The maintainer's other Pages site
(`x86-soundscape.jenny-page.online`) is a **Name.com** domain on **Cloudflare**
nameservers — a separate zone sharing no records, and a different hostname, so
there is no conflict between the two setups.

**Done 2026-09-14:**

- Pages source set to **GitHub Actions** via `POST /repos/…/pages` with
  `build_type=workflow`; read back `build_type: workflow`.
- Custom domain attached via `PUT /repos/…/pages -f cname=flocksafety.cam`.
  GitHub accepted it with no "domain already taken" error, which is itself the
  cross-repo conflict check.
- Porkbun DNS: the default parking records — an apex **ALIAS** and a `www`
  CNAME, both to `pixie.porkbun.com` — were removed. The ALIAS is what made
  every A/AAAA add fail with *"A record error: conflict"*: Porkbun will not let
  A or AAAA records share a host with an ALIAS. They were replaced with the four
  Pages `A` records, the four `AAAA` records, and a `www` CNAME to
  `jennymaeleidig.github.io`. The apex **Host field is left blank** — Porkbun's
  own KB (article 54) documents a blank Host for the root, where GitHub's docs
  write `@`.
- Propagation confirmed against Cloudflare DoH (1.1.1.1), a resolver that had
  never seen the domain before.
- **Certificate:** the first attempt stalled — no `https_certificate` object, the
  UI stuck on "DNS Check in Progress" — because the domain was configured before
  DNS was correct. GitHub's troubleshooting doc names the remedy ("After you
  update existing DNS settings, you may need to remove and re-add your custom
  domain to trigger the process of enabling HTTPS"), and it worked immediately:
  `state: approved`, domains `flocksafety.cam` and `www.flocksafety.cam`,
  expiring 2026-12-13.
- `https_enforced` turned on; `http://` 301s to `https://` and `www` 301s to the
  apex.
- The account-level **verified domain** flow was also completed for
  `flocksafety.cam` — an anti-takeover measure, separate from the repo setting.

**Old project URLs — better than the accepted cost.** The ticket allowed for
these 404ing. They do not; they **301** to the custom domain with the path
preserved:

```
/interactive-media-production/                     → 301 → https://flocksafety.cam/                     → 200
/interactive-media-production/accessibility-plan   → 301 → https://flocksafety.cam/accessibility-plan   → 200
```

**One wizard correction worth recording.** The DNS wizard
(`.scratch/gh-pages/setup-custom-domain.sh`) originally printed `@` in its host
column. Porkbun uses a blank Host for the apex; the script now prints `(blank)`
and explains the difference, leads with the ALIAS deletion, and names
`pixie.porkbun.com` so the park is recognisable.
