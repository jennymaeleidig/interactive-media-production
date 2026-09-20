# Accept the impersonation risk

This project deliberately reproduces Flock Group Inc's wordmark, palette, and typefaces on
`flocksafety.cam`, a domain that company does not own. That is the impersonation pattern browser
Safe Browsing heuristics flag, and it sits squarely against Flock's trademark notice, which grants
no licence to third parties and reserves all rights, with written permission from
legal@flocksafety.com as the only stated path.

**Jenny Leidig accepts this exposure, knowingly and on 2026-02-18.** No one else assumes it: not
the repository, not its tooling, not any future contributor. Anyone who forks, deploys, or extends
this work carries their own exposure and cannot rely on this acceptance.

The response to the risk is preventive and reactive only — reduce signals, report false positives,
and wait out caches. It is never evasion. Cloaking, serving different content to reviewers or
crawlers, and defeating `frame-ancestors` are all out of scope, with the reasoning recorded on the
map at `.scratch/flock-chatbot/map.md`.

## Consequences

- The piece is unlisted and never indexed; no lead capture, analytics, or viewer identifiers.
- The browser-warning exposure is an expected state, not a bug to be engineered away. The honest
  path out is published in `docs/share.md`.
