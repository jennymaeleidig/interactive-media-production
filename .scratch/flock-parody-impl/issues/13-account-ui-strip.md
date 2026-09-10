# 13: Account-UI strip

**What to build:** No account functionality anywhere in the Recreation. The header and footer Sign In chrome (pointing at the account portal `users.flocksafety.com`) is removed from every served page, and inline account/auth links (`login.flocksafety.com`) are unwrapped so their words survive. Nothing is mocked — no account page, no login mock, no cart. The site-wide strip audit must report zero account/auth host references.

**Blocked by:** 01, 07.

**Status:** resolved
Label: ready-for-agent

- [x] The header and footer Sign In chrome is gone from every served page.
- [x] Inline account/auth copy links lose the link but keep their words (word-for-word bar).
- [x] The site-wide strip audit reports zero account/auth host references.
- [x] No account page, route, or mock exists anywhere.
- [x] The pipeline test covers an account fixture (chrome removed, copy unwrapped, audit zero).

## Comments

**Implemented** on top of ticket 07. Scope was measured, not assumed: the
corpus's only account **UI** is the `users.flocksafety.com` Sign In link in the
header button group and the footer link (2,358 hrefs), plus one inline
`login.flocksafety.com` link on `/faq.html` whose anchor text is "Help Center".
The words "account", "register", "portal", and "dashboard" appear in ordinary
page copy (e.g. "Book a meeting with your Flock **Account** Executive") and are
not affordances — the rule keys on the **host**, never the word. There is no
cart UI in the corpus (only FontAwesome's `fa-cart-*` icon CSS).

- **Strip rule** (`pipeline/build.mjs`): a `STRIP_TARGETS` entry removes
  account/auth anchors wholesale when they are chrome (class carries `button`
  or `footer-5_link`), content-keyed so a copy link is not collapsed; a
  following unwrap step drops the link from any remaining account/auth anchor
  and keeps its inner content.
- **Audit**: `AUDIT_RES.account = /(?:users|login)\.flocksafety\.com/i` joins
  the zero-on-every-page invariants, so `npm run routes` fails if any account
  host survives (the audit is part of the full-scale serving check).
- **Real-run result**: `npm run pipeline` stripped **657,745 bytes across
  1,179 pages** (`account sign-in link`) plus **1 unwrap** (FAQ, copy kept);
  `npm run routes` green with `byte-identity: 1180 served page(s)`; **0**
  occurrences of `users.flocksafety.com` / `login.flocksafety.com` under all of
  `served/` and **0** residual "Sign In" text.
- **Test**: `test/fixtures/capture-run/account.html` (header button + footer
  link + inline copy link + an "Account Executive" copy sentence) with a
  strip-pass test asserting chrome gone, copy kept, and `audit.account === 0`.
- **Docs**: spec strip list, story 25, and Out of Scope updated;
  CODING_STANDARDS gained the "account surfaces are stripped, never mocked"
  rule and the audit invariant; CONTEXT's Strip decision term lists the chrome.
  The decision itself is recorded as **ADR-0001** (`docs/adr/0001-no-account-features.md`).
