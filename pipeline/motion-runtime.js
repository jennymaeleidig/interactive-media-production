// SPDX-License-Identifier: CC0-1.0
// The motion reveal layer, runtime half — injected into every served page, and
// carried by the tree as a content-addressed asset (ticket 04). Pair with
// pipeline/motion.css: this file toggles the classes its rules key on
// ("fpm" = flock-parody-motion, the family the data-flock-parody="motion"
// tags anchor).
//
// Reveals only (ticket 04; delegated click interactions are ticket 05):
//   • gated on prefers-reduced-motion — reduced (or no JS at all) leaves the
//     page at the normalized static end-state the build wrote;
//   • adds .fpm-motion to <html>, arming the CSS from-states;
//   • re-fires the hero split (remove/re-add .is-visible — the captured CSS
//     does the actual animation);
//   • IntersectionObserver one-shot reveals (.fpm-in) for the explicit
//     patterns and the build's generic data-fpm-reveal tags. Without IO
//     support every target is released immediately — the page still lands on
//     its static end-state.
// This file is read as text and inlined verbatim into served bytes; keep it
// free of any closing-script markup and free of page copy — code-owned
// strings only.
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  root.classList.add('fpm-motion');

  // hero split-on-load: .is-visible was captured ON (end-state). Remove it,
  // then re-add after a double rAF so the captured transitions play.
  var heroes = d.querySelectorAll('[data-split-title].is-visible');
  if (heroes.length) {
    heroes.forEach(function (h) { h.classList.remove('is-visible'); });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        heroes.forEach(function (h) { h.classList.add('is-visible'); });
      });
    });
  }

  // one-shot scroll reveals: explicit patterns + the generic sweep's tags.
  // COUPLING: a census pattern means touching this selector and the from-state
  // rules in motion.css. (It also meant the reveal normalization in the build,
  // which retired with the captures — the tree already carries its output.)
  // Both remaining listings exist so a fidelity review can see which patterns
  // reveal.
  var targets = d.querySelectorAll(
    '[data-animation-gsap=fade-in],[data-animation-gsap=fade-in-2],' +
    '[data-animation-gsap=image-clip],[data-animation-gsap=clip-in],' +
    '[data-split-gsap],[data-animation-gsap=words],[data-animation-gsap=lines],' +
    '[data-fpm-reveal],.alpha-media__stage'
  );
  if (targets.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('fpm-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('fpm-in'); });
  }
})();
