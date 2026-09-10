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
