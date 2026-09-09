# CONTEXT.md

Glossary for this repo. Terms are added as they resolve in conversation; no implementation detail lives here.

## Terms

- **Capture** — a SingleFile snapshot of a live flocksafety.com page; the ground truth the Recreation is verified against.
- **Recreation** — the word-for-word, CSS-exact, function-by-function rebuild of flocksafety.com as a Next.js app; the art piece's first milestone. The user's phrase: "EXACT recreation".
- **Parody layer** — the reserved seam where the Recreation will later diverge into the art piece; deliberately unspecified until its own effort.
- **Chat mimic** — the cloned chat assistant (the real site's is Qualified), powered by a yarnspinner-ts wrapper instead of a live backend. Yarn script content is a separate future effort written by the user.
- **Link policy** — captured internal links repoint at Recreation routes; external links remain untouched.
