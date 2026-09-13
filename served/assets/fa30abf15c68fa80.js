
// SPDX-License-Identifier: CC0-1.0
// The shared header's behavior layer, runtime half (ticket 14) — injected
// inline into every served page by the build (pipeline/build.mjs navPass).
//
// The live site's header script (fetched from the page, 2026-09-11) drives
// three things by class, and the corrected Capture's own stylesheet renders
// every state off them:
//   scroll -> #header (.header-z) gets .scroll (plus .scroll-up while
//             scrolling down; the live rule for it is commented out, but the
//             class is kept for fidelity)
//   hover  -> .nav__dd gets .show at >=992px; a tap toggles it below
//   button -> .header__bg gets .is-open, and the mobile menu list reveals
// The live site animated the reveal and the hamburger cross with a stripped
// runtime; this file performs those two moves itself. Reduced motion only
// drops the reveal animation, never the state change.
//
// This file is read as text and inlined verbatim into served bytes; keep it
// free of any closing-script markup and free of page copy — code-owned
// strings only.
(function () {
  'use strict';

  var DESKTOP_MIN = 992; // the live breakpoint the mobile branch keys on
  var REVEAL_MS = 300; // the live reveal's measured duration
  var DISMISS_MS = 10; // the live Back-link rule cleared .show after this delay

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function init() {
    var header = document.getElementById('header');
    if (!header) return;
    var headerBg = document.querySelector('.header__bg');
    var menuList = document.querySelector('.nav__menu-list');
    var menuButton = document.querySelector('.nav__menu-button');
    var dropdowns = document.querySelectorAll('.nav__dd');
    var backLinks = document.querySelectorAll('.nav_back-link');
    var motion = !reducedMotion();
    var lastScrollTop = 0;
    var open = false;
    var closeTimer = null;

    if (motion) header.classList.add('fpn-motion');

    function onScroll() {
      var top = window.scrollY || document.documentElement.scrollTop || 0;
      if (top > 0) header.classList.add('scroll');
      else header.classList.remove('scroll');
      if (top > lastScrollTop) header.classList.add('scroll-up');
      else header.classList.remove('scroll-up');
      lastScrollTop = top <= 0 ? 0 : top;
    }

    function bindHover(dd) {
      dd.addEventListener('mouseenter', function () {
        if (isDesktop()) dd.classList.add('show');
      });
      dd.addEventListener('mouseleave', function () {
        if (isDesktop()) dd.classList.remove('show');
      });
    }

    function bindBack(link) {
      link.addEventListener('click', function () {
        setTimeout(function () {
          var shown = document.querySelectorAll('.nav__dd.show');
          for (var i = 0; i < shown.length; i++) shown[i].classList.remove('show');
        }, DISMISS_MS);
      });
    }

    // Desktop: the trigger is a link and navigates (no preventDefault);
    // mobile: a tap toggles the accordion row.
    function onTriggerClick(e) {
      var trigger = e.target && e.target.closest ? e.target.closest('.nav__dd-trigger') : null;
      if (!trigger || isDesktop()) return;
      e.preventDefault();
      var dd = trigger.closest('.nav__dd');
      if (dd) dd.classList.toggle('show');
    }

    // The mobile take-over: live toggled .header__bg.is-open and revealed the
    // menu list with inline opacity/transform; mirror both.
    function setTakeover(show) {
      open = show;
      if (headerBg) headerBg.classList[show ? 'add' : 'remove']('is-open');
      if (menuButton) menuButton.classList[show ? 'add' : 'remove']('is-open');
      if (!menuList) return;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      if (show) {
        menuList.style.display = 'block';
        if (!motion) { menuList.style.opacity = ''; menuList.style.transform = ''; return; }
        menuList.style.opacity = '0';
        menuList.style.transform = 'translate3d(0, 10px, 0)';
        void menuList.offsetWidth; // reflow — arm the transition from the captured from-state
        menuList.style.opacity = '1';
        menuList.style.transform = 'translate3d(0, 0, 0)';
        return;
      }
      if (!motion) {
        menuList.style.display = 'none';
        menuList.style.opacity = '';
        menuList.style.transform = '';
        return;
      }
      menuList.style.opacity = '0';
      menuList.style.transform = 'translate3d(0, 10px, 0)';
      closeTimer = setTimeout(function () {
        closeTimer = null;
        if (open) return; // re-opened mid-flight — leave the open state alone
        menuList.style.display = 'none';
        menuList.style.opacity = '';
        menuList.style.transform = '';
      }, REVEAL_MS);
    }

    function onButtonClick(e) {
      e.preventDefault();
      setTakeover(!open);
    }

    // Outside click closes the open mega-menu (mobile only, as live).
    function onDocClick(e) {
      if (isDesktop()) return;
      for (var i = 0; i < dropdowns.length; i++) {
        if (!dropdowns[i].contains(e.target)) dropdowns[i].classList.remove('show');
      }
    }

    function onResize() {
      for (var i = 0; i < dropdowns.length; i++) dropdowns[i].classList.remove('show');
      // Resizing into the desktop layout must drop the mobile take-over with it —
      // the inline reveal it set would otherwise outlive its breakpoint.
      if (open && isDesktop()) {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        open = false;
        if (headerBg) headerBg.classList.remove('is-open');
        if (menuButton) menuButton.classList.remove('is-open');
        if (menuList) {
          menuList.style.display = '';
          menuList.style.opacity = '';
          menuList.style.transform = '';
        }
      }
    }

    var i;
    for (i = 0; i < dropdowns.length; i++) bindHover(dropdowns[i]);
    for (i = 0; i < backLinks.length; i++) bindBack(backLinks[i]);

    document.addEventListener('click', onTriggerClick, false);
    document.addEventListener('click', onDocClick, false);
    window.addEventListener('scroll', onScroll, false);
    window.addEventListener('resize', onResize, false);
    if (menuButton) menuButton.addEventListener('click', onButtonClick, false);
    onScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, false);
  else init();
})();

