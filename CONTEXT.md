# CONTEXT.md

Glossary for this repo. Terms are added as they resolve in conversation; no implementation detail lives here.

## Terms

- **Capture** — a SingleFile snapshot of a live flocksafety.com page; the ground truth the Recreation is verified against.
- **Recreation** — the word-for-word, CSS-exact, function-by-function rebuild of flocksafety.com as a Next.js app; the art piece's first milestone. The user's phrase: "EXACT recreation".
- **Parody layer** — the reserved seam where the Recreation will later diverge into the art piece; deliberately unspecified until its own effort.
- **Chat mimic** — the cloned chat assistant (the real site's is Qualified), powered by a yarnspinner-ts wrapper instead of a live backend. Yarn script content is a separate future effort written by the user.
- **Link policy** — captured internal links repoint at Recreation routes; external links remain untouched.
- **Motion layer** — the reveal mimic that restores the Captures' scroll- and load-driven motion: the build normalizes every captured animation from-state to its static end-state, then declarative annotations and one shared CSS/JS pair (injected, never the original runtime) play the reveals one-shot; reduced motion and no-JS both render the static end-state.
- **Interaction layer** — the delegated-click mimic that restores the Captures' tab, dropdown, accordion, and slider behavior: one shared CSS/JS pair (injected, never the original Webflow/Swiper/GSAP runtimes) operates the captured classes and geometry from a single document listener, with zero per-page bespoke logic; reduced motion degrades every animation to instant function, never to a broken widget.
- **From-state / end-state** — an element's captured pre-animation style (e.g. inline `opacity:0`, blurred split words) versus its final static look; the build normalizes former to latter, and the motion layer re-applies from-states only while animating.
- **Serving check** — the full-scale HTTP check (`npm run routes`, ~10 s) that the serving layer does its job: every live page 200, every legacy redirect stub 301 to its local target, every dead collection root / auth-gated stub / dropped scaffold-test page 404, the count identity (served + dropped accounts for every page the capture run listed), the site-wide strip audit (zero tracker residue, no capture-derived executable script), and **byte-identity** — every served page's body must equal the file the build wrote. Same bytes ⇒ same pixels, so byte-identity is the serving layer's whole guarantee; there is no pixel gate (the retired ticket-06 harness compared the served tree against itself).
- **Strip decision** — what the build pass removed from each Capture (Qualified offer host and header-height var, the chat launcher, the OneTrust consent stack, the account/auth Sign In chrome), recorded per page in the build log with removed byte counts; the human side-by-side at the phase gates reviews the visual result.
- **Email gate** — the Chat mimic's demo-branch stop: the pinned demo-ask reply followed by a single "Maybe later" option that returns to the hub option set. Nothing is captured or submitted, and no divergence notice is rendered; the intentional stop is stated only in `dialogue/flock.yarn`.
- **Hub option set** — the shared choice set (help / Get a Demo / Support) re-offered to the visitor without repeating the greeting. The email gate returns here, so the conversation never dead-ends.
