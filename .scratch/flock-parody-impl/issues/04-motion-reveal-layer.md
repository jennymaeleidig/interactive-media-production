# 04: Motion reveal layer

**What to build:** The scroll- and load-driven motion the original site has, restored cheaply. The build normalizes every captured from-state to its static end-state, then injects a shared snippet and declarative annotations. The hero split re-fires the original visibility class so the captured transition CSS plays verbatim; scroll word-splits (including the masked variant), fades, and clip reveals fire one-shot with per-element stagger; a generic pass normalizes any inline zero-opacity from-state it finds. With reduced motion requested, or with JavaScript disabled, every page renders as the static end-state.

**Blocked by:** 01.

**Status:** resolved
Label: ready-for-agent

- [x] The homepage hero split animates on load and reveals animate on scroll.
- [x] Word-split staggering matches the captured timing.
- [x] Fades and clip reveals play once and settle at the captured end-state.
- [x] The generic zero-opacity normalization covers elements no explicit rule names, logged per page.
- [x] Reduced-motion renders fully static pages.
- [x] JavaScript-disabled renders fully static pages.
- [x] No per-page bespoke motion logic exists — annotations only.
- [x] Every normalization is logged for human review.

## Comments

**Resolved (ticket 04).** Built as `pipeline/motion.css` + `pipeline/motion-runtime.js`, injected inline by build pass 4 (`pipeline/build.mjs`, `motionPass`) — the story-hook seam's shape: shared snippet + declarative keys, zero per-page bespoke logic.

- **Normalizations (explicit, census patterns 1–7):** split words (`.word`/`.split-word` inside `data-split-gsap=words` and the masked `data-animation-gsap=words|lines`) lose their captured from-inline (slate/blur/rise/0.45) and gain `--fpm-i` per-container stagger indices (58 ms/word, calc'd in CSS); fade-in-2 / fade-in rise-24 / bare fade / image-clip / clip-in from-states normalize to the captured end-values. The hero (`data-split-title`) is left at its captured `.is-visible` end-state; the runtime removes and re-adds the class on a double rAF so the captured transition CSS plays verbatim.
- **Generic sweep (census pattern 9):** inline `opacity:0` from-states on elements no explicit rule names are normalized and tagged `data-fpm-reveal` for the observer. Guards exclude the persistent-hidden signatures found in the corpus (pointer-events:none panes, non-identity-transform hover CTAs, inline-transition player chrome, display:none, position:fixed/absolute) — on the real subset this kept all 10 LPR Wistia chrome pieces frozen while sweeping the 1 genuine IX2 from-state on `/book-a-demo` and the ambiguous bare `title-wr is-section` on `/products/video-cameras` (logged for the phase-gate review; capture evidence can't prove whether the live site ever revealed it, but a permanently invisible FAQ heading is the less faithful reading).
- **Mutations run only outside `<style>`/`<script>`/comment/`srcdoc` zones** — the inlined site CSS is full of `opacity:0` (15 on one post) and the frozen scheduler iframe embeds a document.
- **Static contract by construction:** every injected from-state rule is gated under `html.fpm-motion`, which only the runtime adds (never when reduced motion is requested; no JS at all = the class never lands). A pipeline test parses the injected CSS and asserts the gating; the motion DOM seam tests the runtime's reduced-motion branch against the exact injected bytes.
- **Smooth scroll** (`scroll-behavior: smooth`, media-gated) ships in the motion CSS as the tier-1 floor for anchor jumps (user story 17) — not in this ticket's checkbox list, but it is the motion layer's CSS half and costs nothing.
- **Real-subset log** (served/build-log.json): `/` hero×1 + words×38 + fade-in-2×3 + image-clip×5; LPR rise-24×16 + masked words×36; press-center bare×1; video-cameras generic×1; book-a-demo generic×1; blog/thank-you/chilipiper-2 clean. Audit stays clean; scripts census 0 executable everywhere.
- Interactions (tabs/dropdowns/accordion/swiper delegated clicks) are deliberately absent — ticket 05.

**Review fixes (code-review, two axes, parallel sub-agents).** Standards: the runtime header's pass number corrected (4, not 5); the new motion DOM seam is now a documented seam (spec Testing Decisions + CODING_STANDARDS.md Testing list extended — not a silent extension); the gating test asserts on the served page's injected style block, not the source CSS file; `editStyleAttr` generalized to `editAttr(tag, name, edit)` (the clip-in branch now reuses it instead of re-rolling the quoted-attr grammar); `withAddedAttr` param renamed; the runtime's contradictory ES5 posture resolved (raw `NodeList.forEach` throughout); `fpm` prefix expanded in both injected files; from-state keep-in-sync notes added across build/CSS; the hero count rides the same content-only segment scan; unknown `data-animation-gsap` values are logged (`unrecognized … left as captured`); a fade-in whose from-state isn't fully consumed warns. Spec: two real fidelity bugs found and fixed — (1) the bare fade variant (press-center shape) was getting a phantom 24px rise; the build now annotates it `data-fpm-fade` and the CSS replays it as a pure fade; (2) the captured blur-radius variants collapsed to 15px; the build now preserves the captured radius per element as `--fpm-blur` (15px stays the CSS default). Carried findings, deliberately not fixed here: tier-1 IX2 hover tweens (`:hover` transitions) are owned by no open ticket — flagged for ticket creation; the transform guard in the generic sweep is conservative v1 and may miss transform-carrying IX2 from-states at ticket-07 scale; the `/products/video-cameras` generic sweep of the ambiguous `title-wr` needs the human side-by-side at the phase gate.
