// The scroll choreography + modal layer (ticket 21). Vanilla, no dependencies.
//
// The live /safe-cities page drove all of this with inline GSAP/ScrollTrigger
// scripts plus Webflow's IX2 data — every byte of which the Capture strips,
// because served pages carry zero executable capture-derived scripts. This
// layer reimplements the observable behavior keyed ONLY on captured attributes
// and classes, so it is not per-page logic (the same code covers any page that
// carries the markup):
//
//   [animate="scrub-word"]  word colors dark -> green -> near-white on
//                           scroll-in, reversed on scroll-back (IX2 t-67b5deff)
//   .line-label             pill scale(0) -> scale(1); its marker slides from
//                           translateY(170%) (IX2 t-4e5bbe4b)
//   [data-scroll-video]     play at 'top 45%', pause at 'bottom 20%'
//   #stickme                sticky to the viewport bottom, released at its
//                           parent's end (.stick / .stick--is-stuck)
//   #main-progress          route draw scrubbed by page scroll (.main-line)
//   dialog.c-modal          open/close via [data-c-modal-open] / [c-modal-close]
//                           / Escape; opening runs the modal's own route draw
//                           (#route-progress on [c-modal-scroll]) and places /
//                           pops in each .marker[data-stop] opposite its event
//
// The build normalizes every captured from-state to its end-state, so with
// JavaScript disabled the page is the settled layout. Reduced motion keeps the
// FUNCTION (the modal still opens, the sticky button still sticks, the markers
// are placed) but skips the animation: the decoration stays at the build's
// end-state. `fpm-scroll` is always added — scroll.css only carries structure
// (SVG marker transform-box, the modal scroll lock), never a from-state.
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduce = !!(motion && motion.matches);

  root.className += (root.className ? ' ' : '') + 'fpm-scroll';

  var raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (f) { return setTimeout(f, 16); };

  function vh() { return root.clientHeight || window.innerHeight; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function dispatch(name, dialog) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: { modal: dialog } })); } catch (e) {}
  }

  // ---- one shared scroll ticker: every behavior registers a callback --------
  var callbacks = [];
  var pending = false;
  function tick() {
    pending = false;
    for (var i = 0; i < callbacks.length; i++) { try { callbacks[i](); } catch (e) {} }
  }
  function onScroll(fn) { callbacks.push(fn); }
  function schedule() { if (!pending) { pending = true; raf(tick); } }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  // A cancelable per-element tween (interrupted by the next play/reverse).
  function tween(from, to, duration, update) {
    var box = { cancelled: false };
    if (duration <= 0) { update(to); return box; }
    var start = null;
    function step(ts) {
      if (box.cancelled) return;
      if (start === null) start = ts;
      var p = clamp01((ts - start) / duration);
      update(lerp(from, to, p));
      if (p < 1) raf(step);
    }
    raf(step);
    return box;
  }

  // IX2's toggleActions 'play reverse none reverse' on a scroll trigger whose
  // start is `ratio` of the viewport: play crossing in, reverse crossing back.
  function playReverse(el, ratio, play, reverse) {
    var active = null;
    function check() {
      var on = el.getBoundingClientRect().top <= vh() * ratio;
      if (on === active) return;
      active = on;
      if (on) play(); else reverse();
    }
    onScroll(check);
    check();
  }

  // ---- scroll-driven decoration (skipped under reduced motion) --------------
  if (!reduce) {
    // 1. [animate="scrub-word"] word colors (IX2 t-67b5deff). The captured IX2
    // data: dark hsla(100,12.68%,13.92%) -> green hsla(106.9,59.78%,63.92%)
    // over .25s, then green -> light hsla(105,11.11%,92.94%) over .3s,
    // .05s/word stagger.
    (function () {
      var WORD_DARK = [34, 40, 31];
      var WORD_GREEN = [132, 218, 108];
      var WORD_LIGHT = [236, 239, 235];
      function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
      function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
      function wordColor(t) {
        if (t <= 0) return WORD_DARK;
        if (t < 0.25) return mix(WORD_DARK, WORD_GREEN, t / 0.25);
        if (t < 0.55) return mix(WORD_GREEN, WORD_LIGHT, (t - 0.25) / 0.3);
        return WORD_LIGHT;
      }

      doc.querySelectorAll('[animate="scrub-word"]').forEach(function (heading) {
        var words = heading.querySelectorAll('.gsap_split_word');
        if (!words.length) return;
        var total = 0.55 + 0.05 * (words.length - 1); // seconds
        var progress = 0; // 0..1 of the timeline
        var box = null;

        function render() {
          var time = progress * total;
          for (var i = 0; i < words.length; i++) words[i].style.color = rgb(wordColor(time - i * 0.05));
        }
        function play(seconds) {
          if (box) box.cancelled = true;
          box = tween(progress * total, total, seconds, function (v) { progress = v / total; render(); });
        }
        function reverse(seconds) {
          if (box) box.cancelled = true;
          box = tween(progress * total, 0, seconds, function (v) { progress = v / total; render(); });
        }
        playReverse(heading, 0.7,
          function () { play(progress * total >= total ? 0 : (total - progress * total) * 1000); },
          function () { reverse(progress * total * 1000); });
      });
    })();

    // 2. .line-label reveal (IX2 t-4e5bbe4b)
    doc.querySelectorAll('.line-label').forEach(function (label) {
      var markers = label.querySelectorAll('.line-label--marker');
      var progress = 0;
      var box = null;
      function apply() {
        var s = easeOutCubic(progress);
        label.style.transform = 'translate3d(0,0,0) scale(' + s + ',' + s + ')';
        for (var i = 0; i < markers.length; i++) markers[i].style.transform = 'translate(0,' + lerp(170, 0, easeOutCubic(progress)) + '%)';
      }
      function play(seconds) { if (box) box.cancelled = true; box = tween(progress, 1, seconds, function (v) { progress = v; apply(); }); }
      function reverse(seconds) { if (box) box.cancelled = true; box = tween(progress, 0, seconds, function (v) { progress = v; apply(); }); }
      playReverse(label, 0.4,
        function () { play((1 - progress) * 250); },
        function () { reverse(progress * 250); });
    });

    // 3. [data-scroll-video] play in view, pause out
    var videos = doc.querySelectorAll('[data-scroll-video]');
    if (videos.length) {
      onScroll(function () {
        var h = vh();
        for (var i = 0; i < videos.length; i++) {
          var r = videos[i].getBoundingClientRect();
          var active = r.top <= h * 0.45 && r.bottom >= h * 0.2;
          if (active && videos[i].paused) {
            var p = videos[i].play();
            if (p && p.catch) p.catch(function () {});
          } else if (!active && !videos[i].paused) {
            videos[i].pause();
          }
        }
      });
    }

    // 5. page route draw: #main-progress scrubbed by .main-line. The main-line
    // starts sticky at the viewport top and tracks progress to scroll position.
    if (routeLength(doc.getElementById('main-progress')) > 0) {
      var mainLine = doc.querySelector('.main-line');
      var mainPath = doc.getElementById('main-progress');
      var mainLen = routeLength(mainPath);
      if (mainLine) {
        mainPath.style.strokeDasharray = mainLen;
        mainPath.style.strokeDashoffset = mainLen;
        onScroll(function () {
          var r = mainLine.getBoundingClientRect();
          var h = vh();
          var p = clamp01((h * 0.38 - r.top) / (r.height || 1));
          mainPath.style.strokeDashoffset = mainLen * (1 - p);
        });
      }
    }
  }

  // ---- 4. #stickme sticky button (function; runs under reduced motion too) ---
  var stick = doc.getElementById('stickme');
  if (stick && stick.parentNode) {
    (function () {
      var parent = stick.parentNode;
      onScroll(function () {
        var scrollTop = root.scrollTop || doc.body.scrollTop;
        var viewportBottom = scrollTop + vh();
        var rect = stick.getBoundingClientRect();
        var stickBottom = scrollTop + rect.top + stick.offsetHeight;
        var parentRect = parent.getBoundingClientRect();
        var parentBottom = scrollTop + parentRect.top + parentRect.height;
        if (viewportBottom > stickBottom) stick.classList.add('stick');
        else stick.classList.remove('stick');
        if (viewportBottom > parentBottom) stick.classList.add('stick--is-stuck');
        else stick.classList.remove('stick--is-stuck');
      });
    })();
  }

  // ---- 6. modal system: open / close (function; runs under reduced motion) ---
  doc.querySelectorAll('dialog.c-modal').forEach(function (dialog) {
    if (dialog.dataset.fpsModal) return;
    dialog.dataset.fpsModal = 'true';
    var id = dialog.getAttribute('data-c-modal');
    if (!id) return;
    var panel = dialog.querySelector('.c-modal__panel');
    var scroller = dialog.querySelector('[c-modal-scroll]') || dialog;
    var modalOpen = false;
    var lastFocus = null;

    // the modal's own route draw is re-armed on each open
    dialog.fpsRoute = { render: null };
    scroller.addEventListener('scroll', function () {
      raf(function () { if (dialog.fpsRoute.render) dialog.fpsRoute.render(); });
    }, { passive: true });

    function open() {
      if (modalOpen) return;
      modalOpen = true;
      lastFocus = doc.activeElement;
      doc.body.classList.add('fps-modal-open');
      if (panel && !reduce) {
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(6rem)';
      }
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      dialog.querySelectorAll('[c-modal-scroll]').forEach(function (el) { el.scrollTop = 0; });
      if (panel && !reduce) raf(function () {
        panel.style.transition = 'transform .3s cubic-bezier(.22,.61,.36,1)';
        panel.style.transform = 'translateY(0)';
      });
      initModalRoute(dialog, scroller);
      dispatch('modal-open', dialog);
    }

    function close() {
      if (!modalOpen) return;
      modalOpen = false;
      if (panel && !reduce) {
        panel.style.transition = 'transform .3s cubic-bezier(.22,.61,.36,1)';
        panel.style.transform = 'translateY(6rem)';
      }
      setTimeout(function () {
        if (dialog.close) { try { dialog.close(); } catch (e) {} } else dialog.removeAttribute('open');
        doc.body.classList.remove('fps-modal-open');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        dialog.fpsRoute.render = null;
        dispatch('modal-close', dialog);
      }, panel && !reduce ? 300 : 0);
    }

    dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dialog.addEventListener('click', function (e) {
      var hit = e.target && e.target.closest ? e.target.closest('[c-modal-close]') : null;
      if (hit) close();
    });
    doc.addEventListener('click', function (e) {
      var hit = e.target && e.target.closest ? e.target.closest('[data-c-modal-open="' + id + '"]') : null;
      if (!hit) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open();
    });

    // ?modal-id=<id> deep-links straight into the modal (the live behavior)
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('modal-id') === id) {
        open();
        params.delete('modal-id');
        history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash);
      }
    } catch (e) {}
  });

  // ---- 7. modal route draw + markers (live inline #25) ----------------------
  function initModalRoute(dialog, scroller) {
    var trigger = dialog.querySelector('.sub-line');
    var path = dialog.querySelector('#route-progress');
    var len = routeLength(path);
    if (!trigger || !path || len <= 0) { dialog.fpsRoute.render = null; return; }

    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    var markers = [];
    dialog.querySelectorAll('.marker[data-stop]').forEach(function (circle) {
      var ts = dialog.querySelector('#' + circle.getAttribute('data-stop'));
      if (!ts) return;
      // the pop-in from-state is animation only; reduced motion shows it placed
      circle.style.opacity = reduce ? '1' : '0';
      circle.style.transform = reduce ? 'scale(1)' : 'scale(0)';
      circle.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1), opacity .4s ease';
      markers.push({
        circle: circle,
        ts: ts,
        offset: parseFloat(circle.getAttribute('data-offset') || '0') || 0,
        shown: reduce,
      });
    });

    function render() {
      var scRect = scroller === dialog ? dialog.getBoundingClientRect() : scroller.getBoundingClientRect();
      var trigRect = trigger.getBoundingClientRect();
      var h = (scroller === dialog ? dialog.clientHeight : scroller.clientHeight) || vh();
      var top = trigRect.top - scRect.top;
      var bottom = trigRect.bottom - scRect.top;
      var span = bottom - (h * 0.4) - (h * 0.7 - h * 0.4); // scroll distance start -> end
      var p = span > 0 ? clamp01((h * 0.4 - top) / span) : clamp01((h * 0.4 - top) / (trigRect.height || 1));
      path.style.strokeDashoffset = reduce ? 0 : len * (1 - p);

      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        var tsRect = m.ts.getBoundingClientRect();
        var along = clamp01((tsRect.top - trigRect.top) / (trigRect.height || 1));
        var at = Math.max(0, Math.min(along * len + m.offset, len - 1));
        var pt = path.getPointAtLength(at);
        m.circle.setAttribute('cx', pt.x);
        m.circle.setAttribute('cy', pt.y);

        var on = reduce || tsRect.top - scRect.top <= h * 0.38;
        if (on !== m.shown) {
          m.shown = on;
          m.circle.style.opacity = on ? '1' : '0';
          m.circle.style.transform = on ? 'scale(1)' : 'scale(0)';
        }
      }
    }

    dialog.fpsRoute.render = render;
    render();
  }

  function routeLength(path) {
    if (!path || !path.getTotalLength) return 0;
    try { return path.getTotalLength() || 0; } catch (e) { return 0; }
  }

  // ---- initial pass: every callback once (page geometry), then scroll ------
  schedule();
})();
