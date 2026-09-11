// SPDX-License-Identifier: CC0-1.0
// The delegated interaction layer, runtime half — injected inline into every
// served page by the build (pipeline/build.mjs pass 5, ticket 05). Sibling of
// the motion reveal layer (pass 4): where that layer restores scroll/load
// reveals, this one restores CLICK behavior — tabs, dropdowns, accordions,
// and sliders — operating the captured classes and geometry directly, never
// the original Webflow/Swiper/GSAP runtimes (spec, Implementation Decisions:
// "Interactions, delegated clicks ... geometry and classes from the
// Capture").
//
// One delegated document click listener serves every family; each family is
// keyed on captured classes/attributes only (research/08 census patterns
// 11-15) — zero per-page bespoke logic:
//   • custom accordion   [data-accordion-toggle] — data-accordion-status,
//     aria-expanded, panel grid-template-rows 0fr<->1fr, icon bar rotation.
//     Deliberately NO height tween (ticket 05 rules the license-plate-reader
//     accordion function-only): the captured 0.35s grid-rows transition is
//     suppressed by the layer's CSS half (pipeline/interactions.css).
//   • Webflow dropdown   .w-dropdown-toggle — w--open + aria-expanded; the
//     captured closed geometry is restored per shape: an inline height
//     (0px<->auto, the animated FAQ shape) or the captured Webflow base rule
//     (.w-dropdown-list{display:none} ↔ .w-dropdown-list.w--open{display:block}).
//   • Webflow tabs       .w-tab-link — w--current/w--tab-active swap by
//     data-w-tab pairing inside the .w-tabs root (the captured base rules
//     .w-tab-pane{display:none} ↔ .w--tab-active{display:block} do the hiding);
//     the captured fade
//     (data-duration-in/out/easing on the root, census 13) plays when motion
//     is allowed and is skipped for reduced motion. A click while a fade is
//     mid-flight is ignored until it completes (max ~400ms) — never
//     double-armed.
//   • custom tabs        [data-tabs=<stem>-menu-item] paired by index with
//     [data-tabs=<stem>-content-item] under the [data-tabs=<stem>] root
//     (flock-ecosystem home4 system, census 14); is-active plus the captured
//     pane styles (hidden: opacity:0;pointer-events:none;position:absolute;
//     active: opacity:1;pointer-events:auto;position:relative) swap.
//   • sliders            [data-slider=back|next], [data-swiper-prev|next],
//     and .slider-bullet pagination (census 15): the wrapper translates by
//     captured slide geometry (inline width + margin-right, else laid-out
//     width), clamped to the wrapper's scroll box as Swiper does;
//     swiper-slide-active/next, bullet is-active/aria-current, and the
//     captured disabled vocabulary (swiper-button-disabled or the arrow's
//     is-disabled, aria-disabled, tabindex) move with it. Slide aria-labels
//     are positional (i / N) and already correct in the Capture — untouched.
// Reduced motion never blocks function: only the tab fade branches on
// prefers-reduced-motion (read fresh at each click), everything else is
// instant by construction.
// The shared header's nav is NOT here: it has its own layer (ticket 14,
// pipeline/nav-runtime.js + pipeline/nav.css), which drives the live class
// vocabulary (.nav__dd.show) the corrected capture now carries.
// This file is read as text and inlined verbatim into served bytes; keep it
// free of any closing-script markup and free of page copy — code-owned
// strings only.
(function () {
  'use strict';

  var MENU_ITEM_SUFFIX = '-menu-item';
  var SLIDE_EPSILON = 0.01; // px — float-slop guard for the scroll-box clamp

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // ---- delegation root: one listener, families resolved nearest-first ----

  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.button && e.button !== 0) return;
    // modified clicks belong to the browser (new tabs on href controls)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var el;
    if ((el = t.closest('[data-accordion-toggle]'))) { accordion(el); e.preventDefault(); return; }
    if ((el = t.closest('.w-dropdown-toggle'))) { wDropdown(el); e.preventDefault(); return; }
    if ((el = t.closest('.w-tab-link'))) { wTabs(el); e.preventDefault(); return; }
    if ((el = t.closest('[data-tabs]')) && endsWith(el.getAttribute('data-tabs'), MENU_ITEM_SUFFIX)) { customTabs(el); e.preventDefault(); return; }
    var pg = t.closest('[data-slider=pagination]');
    if (pg) { sliderBullet(pg, t); e.preventDefault(); return; }
    if ((el = t.closest('[data-slider],[data-swiper-prev],[data-swiper-next]'))) { sliderControl(el); e.preventDefault(); return; }
  }

  function endsWith(v, suffix) {
    return typeof v === 'string' && v.length > suffix.length && v.slice(-suffix.length) === suffix;
  }

  // ---- custom accordion (census 12: the accordion-css system) ----

  function accordion(toggle) {
    var item = toggle.closest('[data-accordion-status]');
    if (!item) return;
    var regionId = toggle.getAttribute('aria-controls');
    var region = regionId ? document.getElementById(regionId) : null;
    setAccordion(item, toggle, region, item.getAttribute('data-accordion-status') !== 'active');
  }

  function setAccordion(item, toggle, region, open) {
    item.setAttribute('data-accordion-status', open ? 'active' : 'not-active');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (region) {
      // open = the captured CSS's missing half (rows 1fr inline); close =
      // drop the inline so the captured 0fr rule applies again
      region.style.gridTemplateRows = open ? '1fr' : '';
    }
    // the + collapses to − : the vertical bar rotates onto the horizontal one
    // (transform-origin:center and the 0.35s ease are captured CSS; the
    // height tween alongside it is suppressed by interactions.css)
    var bar = item.querySelector('.accordion-css__item-icon-svg rect:last-child');
    if (bar) bar.style.transform = open ? 'rotate(90deg)' : '';
  }

  // ---- Webflow dropdown (census 11) ----

  function wDropdown(toggle) {
    var root = toggle.closest('.w-dropdown');
    var list = root ? root.querySelector('.w-dropdown-list') : null;
    if (!list) {
      var id = toggle.getAttribute('aria-controls');
      list = id ? document.getElementById(id) : null;
    }
    if (!list) return;
    setDropdown(toggle, list, toggle.getAttribute('aria-expanded') !== 'true');
  }

  function setDropdown(toggle, list, open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.classList[open ? 'add' : 'remove']('w--open');
    list.classList[open ? 'add' : 'remove']('w--open');
    if (open) {
      if (list.style.height) list.style.height = 'auto'; // the captured animated-height shape
    } else if (list.style.height) {
      list.style.height = '0px'; // restore the captured closed geometry
    }
    // the display:none filter shape needs no marker: the captured
    // .w-dropdown-list base rule hides it and .w-dropdown-list.w--open shows it
    // (ticket 15 — the 2026-09-09 capture had lost that rule, so ticket 05
    // toggled SingleFile's hidden-element artifact class instead).
  }

  // ---- Webflow tabs (census 13) ----

  function wTabs(link) {
    var root = link.closest('.w-tabs');
    if (!root || root.fpiPending) return; // a fade is mid-flight — ignore until it lands
    var name = link.getAttribute('data-w-tab');
    if (!name || root.getAttribute('data-current') === name) return;
    var menu = link.closest('.w-tab-menu') || root;
    var links = menu.querySelectorAll('.w-tab-link');
    var panes = root.querySelectorAll('.w-tab-pane');
    var fromPane = null, toPane = null, i;
    for (i = 0; i < panes.length; i++) {
      if (panes[i].getAttribute('data-w-tab') === name) toPane = panes[i];
      else if (panes[i].classList.contains('w--tab-active')) fromPane = panes[i];
    }
    if (!toPane) return; // validate the pairing BEFORE touching any state — never highlight a pane-less tab
    for (i = 0; i < links.length; i++) {
      if (links[i] === link) setTabLink(links[i], true);
      else if (links[i].classList.contains('w--current')) setTabLink(links[i], false);
    }
    root.setAttribute('data-current', name);
    if (reducedMotion() || !fromPane) {
      hideTabPane(fromPane);
      showTabPane(toPane);
      return;
    }
    // the captured fade (data-easing/data-duration-in/out on the root):
    // out over duration-out, then in over duration-in — census 13
    var durOut = parseInt(root.getAttribute('data-duration-out'), 10) || 100;
    var durIn = parseInt(root.getAttribute('data-duration-in'), 10) || 300;
    var easing = root.getAttribute('data-easing') || 'ease';
    root.fpiPending = true;
    fromPane.style.transition = 'opacity ' + durOut + 'ms ' + easing;
    fromPane.style.opacity = '0';
    setTimeout(function () {
      root.fpiPending = false;
      hideTabPane(fromPane);
      showTabPane(toPane);
      if (!durIn) return;
      toPane.style.transition = 'opacity ' + durIn + 'ms ' + easing;
      toPane.style.opacity = '0';
      void toPane.offsetWidth; // reflow — arm the transition from the 0 from-state
      toPane.style.opacity = '1';
      setTimeout(function () {
        toPane.style.transition = '';
        toPane.style.opacity = '';
      }, durIn + 50);
    }, durOut);
  }

  function setTabLink(link, on) {
    link.classList[on ? 'add' : 'remove']('w--current');
    link.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) link.removeAttribute('tabindex');
    else link.setAttribute('tabindex', '-1');
  }

  // The captured base rules do the hiding: .w-tab-pane{display:none} for an
  // inactive pane, .w--tab-active{display:block} for the active one. Moving
  // w--tab-active is the whole swap — no artifact class (ticket 15).
  function hideTabPane(pane) {
    if (!pane) return;
    pane.classList.remove('w--tab-active');
    pane.style.transition = '';
    pane.style.opacity = '';
  }

  function showTabPane(pane) {
    if (!pane) return;
    pane.classList.add('w--tab-active');
  }

  // ---- custom tabs (census 14: menu-item/content-item pairs by index) ----

  function customTabs(btn) {
    var val = btn.getAttribute('data-tabs');
    var stem = val.slice(0, -MENU_ITEM_SUFFIX.length);
    var root = btn.parentNode;
    while (root && root !== document) {
      if (root.getAttribute && root.getAttribute('data-tabs') === stem) break;
      root = root.parentNode;
    }
    if (!root || root === document) return;
    var buttons = [], panes = [], i;
    var all = root.querySelectorAll('[data-tabs]');
    for (i = 0; i < all.length; i++) {
      var v = all[i].getAttribute('data-tabs');
      if (v === stem + MENU_ITEM_SUFFIX) buttons.push(all[i]);
      else if (v === stem + '-content-item') panes.push(all[i]);
    }
    var idx = -1;
    for (i = 0; i < buttons.length; i++) if (buttons[i] === btn) idx = i;
    if (idx < 0 || !panes[idx]) return;
    for (i = 0; i < buttons.length; i++) {
      buttons[i].classList[i === idx ? 'add' : 'remove']('is-active');
      buttons[i].setAttribute('aria-selected', i === idx ? 'true' : 'false');
    }
    for (i = 0; i < panes.length; i++) {
      var on = i === idx;
      panes[i].classList[on ? 'add' : 'remove']('is-active');
      // the captured pane styles (census 14): hidden panes stack absolutely
      // at opacity 0, the active one flows in place
      panes[i].style.opacity = on ? '1' : '0';
      panes[i].style.pointerEvents = on ? 'auto' : 'none';
      panes[i].style.position = on ? 'relative' : 'absolute';
      panes[i].style.inset = '0px';
    }
  }

  // ---- sliders (census 15: Swiper instances, click-driven) ----

  function sliderControl(el) {
    if (el.getAttribute('data-slider') === 'pagination') return; // the container is not a control
    var wrapper = wrapperFor(el);
    if (!wrapper) return;
    slideTo(wrapper, currentIndex(wrapper) + (isBackControl(el) ? -1 : 1), el);
  }

  /** Each captured control vocabulary names its own retreat control. */
  function isBackControl(el) {
    return el.getAttribute('data-slider') === 'back' || el.hasAttribute('data-swiper-prev');
  }

  function sliderBullet(pagination, target) {
    var bullet = target.closest('.slider-bullet');
    if (!bullet) return;
    var wrapper = wrapperFor(pagination);
    if (!wrapper) return;
    var bullets = pagination.querySelectorAll('.slider-bullet');
    for (var i = 0; i < bullets.length; i++) {
      if (bullets[i] === bullet) { slideTo(wrapper, i, null); return; }
    }
  }

  function wrapperFor(el) {
    var id = el.getAttribute('aria-controls');
    if (id) {
      var w = document.getElementById(id);
      if (w) return w;
    }
    var sw = el.closest('.swiper');
    return sw ? sw.querySelector('.swiper-wrapper') : null;
  }

  function slideNodes(wrapper) {
    var out = [];
    var kids = wrapper.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains('swiper-slide')) out.push(kids[i]);
    }
    return out;
  }

  function currentIndex(wrapper) {
    var slides = slideNodes(wrapper);
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].classList.contains('swiper-slide-active')) return i;
    }
    return 0;
  }

  /** Captured slide geometry: inline width + margin-right (the corpus's captured mid-state), else laid-out width. */
  function stepOf(slide) {
    var w = parseFloat(slide.style.width);
    if (!w || w < 0) w = slide.offsetWidth;
    var gap = parseFloat(slide.style.marginRight);
    if (!gap || gap < 0) gap = 0;
    return w + gap;
  }

  function slideTo(wrapper, index, clicked) {
    var slides = slideNodes(wrapper);
    if (!slides.length) return;
    if (index < 0) index = 0;
    if (index > slides.length - 1) index = slides.length - 1;
    var i, at = 0;
    for (i = 0; i < index; i++) at += stepOf(slides[i]);
    // clamp into the wrapper's scroll box — the last slide ends flush, as Swiper rests
    var max = (wrapper.scrollWidth || 0) - (wrapper.clientWidth || 0);
    if (max > 0 && at > max) at = max;
    // the leftmost visible slide is the active one (end-clamp aware)
    var active = 0, acc = 0;
    for (i = 0; i < slides.length; i++) {
      if (acc <= at + SLIDE_EPSILON) active = i;
      acc += stepOf(slides[i]);
    }
    wrapper.style.transform = 'translate3d(' + (at > 0 ? '-' + at : '0') + 'px, 0px, 0px)';
    for (i = 0; i < slides.length; i++) {
      slides[i].classList.remove('swiper-slide-active');
      slides[i].classList.remove('swiper-slide-next');
    }
    slides[active].classList.add('swiper-slide-active');
    if (slides[active + 1]) slides[active + 1].classList.add('swiper-slide-next');
    var sw = wrapper.closest('.swiper');
    var pag = sw ? sw.querySelector('[data-slider=pagination]') : null;
    if (pag) {
      var bullets = pag.querySelectorAll('.slider-bullet');
      for (i = 0; i < bullets.length; i++) {
        var on = i === active;
        bullets[i].classList[on ? 'add' : 'remove']('is-active');
        if (on) bullets[i].setAttribute('aria-current', 'true');
        else bullets[i].removeAttribute('aria-current');
      }
    }
    updateControls(wrapper, at, max, clicked);
  }

  function disabledMarkerFor(btn) {
    // each captured control vocabulary carries its own disabled class
    return btn.classList.contains('swiper-arrow') ? 'is-disabled' : 'swiper-button-disabled';
  }

  function setDisabled(btn, disabled) {
    btn.classList[disabled ? 'add' : 'remove'](disabledMarkerFor(btn));
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.setAttribute('tabindex', disabled ? '-1' : '0');
  }

  function updateControls(wrapper, at, max, clicked) {
    var bound = [];
    var id = wrapper.id;
    if (id) {
      var cands = document.querySelectorAll(
        '[data-slider][aria-controls="' + id + '"],' +
        '[data-swiper-prev][aria-controls="' + id + '"],' +
        '[data-swiper-next][aria-controls="' + id + '"]'
      );
      for (var i = 0; i < cands.length; i++) bound.push(cands[i]);
    }
    if (clicked && bound.indexOf(clicked) < 0) bound.push(clicked);
    for (i = 0; i < bound.length; i++) {
      var btn = bound[i];
      var stuck = isBackControl(btn) ? at <= SLIDE_EPSILON : max > 0 && at >= max - SLIDE_EPSILON;
      setDisabled(btn, stuck);
    }
  }

  document.addEventListener('click', onClick, false);
})();
