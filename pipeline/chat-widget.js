// SPDX-License-Identifier: CC0-1.0
// The Chat mimic's injected runtime (ticket 10): the site-wide mount of the
// captured-fidelity widget ticket 09 built. The build inlines this file
// verbatim, beside pipeline/chat-widget.css, into every served page whose
// Capture mounted the Qualified launcher (the build's per-page census).
//
// It owns the WHOLE widget DOM: the launcher is created here, never in the
// static markup, so a no-JS page renders the captured end-state with no
// widget — exactly as the original, whose launcher was script-injected by
// Qualified. Plain browser JavaScript, ES5-safe, DOM-only. Its only request
// is the same-origin POST to /api/chat (ticket 08).
//
// Contract, as ticket 09 and the message API define it:
//  - one POST per turn (start | resume | option); replies render as COMPLETE
//    bubbles — no typing indicator, no sounds;
//  - the composer box and send icon are visually present but INERT;
//  - the pending Yarn choice set renders as green chips inside the composer
//    slot; selecting one reads as the visitor's own sent message (the server
//    owns the echo);
//  - the pounce is scroll-armed once per session (a restored session does not
//    re-pounce);
//  - the session id persists in localStorage['flock-chat-session'] and is
//    replayed on reload.
(function () {
  'use strict';

  if (window.__flockChat) return; // injected once
  window.__flockChat = true;

  var STORAGE_KEY = 'flock-chat-session';
  /**
   * The pounce is SCROLL-ARMED in the Capture, but the Capture never recorded
   * its thresholds: the live widget's pounce was rule-gated server-side and
   * fired ~36s after load in the observed sessions, with no client-visible
   * constant. These two values are the mimic's documented stand-ins for the
   * captured trigger SHAPE (scroll past the fold, then a short beat) — the
   * only such values here.
   */
  var POUNCE_SCROLL_PX = 120;
  var POUNCE_DELAY_MS = 1500;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Captured icon paths: the widget's own raw SVGs (messenger DOM dumps).
  var TIMES_ICON =
    'M23 20.168l-8.185-8.187 8.185-8.174-2.832-2.807-8.182 8.179-8.176-8.179-2.81 2.81 8.186 8.196-8.186 8.184 2.81 2.81 8.203-8.192 8.18 8.192z';
  var SEND_ICON =
    'M20.5306 2.46969C20.7315 2.67057 20.8016 2.9677 20.7118 3.2372L14.7115 21.2372C14.6156 21.525 14.3558 21.7266 14.0532 21.7481C13.7506 21.7696 13.4648 21.6068 13.3292 21.3354L9.79459 14.2662L14.0305 10.0303C14.3234 9.73744 14.3234 9.26256 14.0305 8.96967C13.7376 8.67678 13.2627 8.67678 12.9698 8.96967L8.73398 13.2055L1.6646 9.67084C1.39328 9.53518 1.23039 9.24944 1.2519 8.94685C1.2734 8.64427 1.47506 8.38443 1.76284 8.28851L19.7631 2.28851C20.0326 2.19867 20.3297 2.26882 20.5306 2.46969Z';

  var state = {
    mode: 'launcher',
    lines: [],
    options: null,
    sessionId: null,
    // the captured "Today, h:mm am" divider is frozen at mount, so it never
    // ticks over mid-conversation
    divider: todayLabel(),
    engaged: false,
    pounceTimer: null,
  };
  var root = null;
  var log = null;

  /** The captured timestamp divider format ("Today, 6:50 am"). */
  function todayLabel() {
    return 'Today, ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(pathD, size, evenOdd) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('height', String(size));
    svg.setAttribute('width', String(size));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathD);
    if (evenOdd) {
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('clip-rule', 'evenodd');
    }
    svg.appendChild(path);
    return svg;
  }

  // ---- rendering -----------------------------------------------------------

  function bubbleRow(line) {
    if (line.from === 'me') {
      var mine = el('div', 'fpc-row fpc-row--me');
      mine.appendChild(el('div', 'fpc-bubble fpc-bubble--me', line.text));
      return mine;
    }
    var row = el('div', 'fpc-row');
    var avatar = el('span', 'fpc-bubble-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    row.appendChild(avatar);
    if (state.mode === 'card') {
      // captured behavior: clicking the greeting preview opens the panel
      var preview = el('button', 'fpc-bubble fpc-bubble--bot fpc-bubble--preview', line.text);
      preview.type = 'button';
      preview.setAttribute('aria-label', 'Message preview - click to open the conversation');
      preview.addEventListener('click', function () {
        open('panel');
      });
      row.appendChild(preview);
    } else {
      row.appendChild(el('div', 'fpc-bubble fpc-bubble--bot', line.text));
    }
    return row;
  }

  function composer() {
    var form = el('form', 'fpc-form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });
    var box = el('div', 'fpc-composer');
    var slot = el('div', 'fpc-slot');
    // The composer is the original's input chrome, INERT: the chips ARE the
    // choices and the send icon does nothing. There is no separate CTA row.
    if (state.options && state.options.length > 0) {
      for (var i = 0; i < state.options.length; i++) {
        (function (option) {
          var chip = el('button', 'fpc-chip', option.text);
          chip.type = 'button';
          chip.addEventListener('click', function () {
            select(option);
          });
          slot.appendChild(chip);
        })(state.options[i]);
      }
    } else {
      slot.appendChild(el('span', 'fpc-placeholder', state.mode === 'card' ? 'Ask a question' : 'Enter a message'));
    }
    box.appendChild(slot);
    var send = el('button', 'fpc-send');
    send.type = 'button';
    send.setAttribute('aria-label', 'Send');
    send.setAttribute('aria-disabled', 'true');
    send.appendChild(icon(SEND_ICON, 20, true));
    box.appendChild(send);
    form.appendChild(box);
    return form;
  }

  function footer() {
    var bar = el('footer', 'fpc-footer');
    bar.setAttribute('aria-label', 'Messenger footer');
    bar.appendChild(document.createTextNode('Flock\u2019s '));
    // The captured widget linked its privacy policy out to the live site; the
    // Recreation's link policy points internal destinations at local routes,
    // so this one does too (same text, Recreation route).
    var link = el('a', null, 'Privacy Policy');
    link.setAttribute('href', '/legal/privacy-policy');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    bar.appendChild(link);
    return bar;
  }

  function surface() {
    var box = el('section', 'fpc-surface fpc-surface--' + state.mode);
    box.setAttribute('aria-label', 'Flock');

    var header = el('header', 'fpc-header');
    var avatar = el('span', 'fpc-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    header.appendChild(avatar);
    var heading = el('div', 'fpc-heading');
    heading.appendChild(el('strong', 'fpc-name', 'Flock'));
    heading.appendChild(el('small', 'fpc-role', 'AI Sales Assistant'));
    header.appendChild(heading);
    var closeBtn = el('button', 'fpc-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close messenger');
    var closeIcon = icon(TIMES_ICON, 12, false);
    closeIcon.setAttribute('class', 'fpc-close__icon');
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);
    box.appendChild(header);

    box.appendChild(el('div', 'fpc-divider', state.divider));

    log = el('div', 'fpc-log');
    var messages = el('div', 'fpc-messages');
    for (var i = 0; i < state.lines.length; i++) messages.appendChild(bubbleRow(state.lines[i]));
    log.appendChild(messages);
    box.appendChild(log);

    box.appendChild(composer());
    box.appendChild(footer());
    return box;
  }

  function render() {
    if (!root) return;
    log = null;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (state.mode === 'launcher') {
      var launcher = el('button', 'fpc-launcher');
      launcher.type = 'button';
      launcher.setAttribute('aria-label', 'Open chat');
      launcher.addEventListener('click', function () {
        open('panel');
      });
      root.appendChild(launcher);
    } else {
      root.appendChild(surface());
    }
    if (log) log.scrollTop = log.scrollHeight;
  }

  // ---- the message API (ticket 08) -----------------------------------------

  function applyResponse(res) {
    state.sessionId = res.sessionId;
    // A session just went live: a pounce armed by an earlier scroll must not
    // fire into it (the captured contract — a live session never re-pounces).
    if (state.pounceTimer) {
      window.clearTimeout(state.pounceTimer);
      state.pounceTimer = null;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, res.sessionId);
    } catch (e) {
      // storage unavailable (private mode) — the session still lives server-side
    }
    if (res.replay) {
      state.lines = res.replay.slice();
    } else if (res.turn && res.turn.lines && res.turn.lines.length > 0) {
      state.lines = state.lines.concat(res.turn.lines);
    }
    state.options =
      res.turn && res.turn.options
        ? res.turn.options.map(function (option) {
            return { index: option.index, text: option.text };
          })
        : null;
    render();
  }

  function post(body) {
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) return;
        return res.json().then(applyResponse);
      })
      .catch(function () {
        // no network is the invariant; a failed turn leaves the last state
      });
  }

  function open(next) {
    state.engaged = true;
    if (state.pounceTimer) {
      window.clearTimeout(state.pounceTimer);
      state.pounceTimer = null;
    }
    state.mode = next;
    render();
    if (!state.sessionId) post({ type: 'start' });
  }

  function close() {
    state.mode = 'launcher';
    render();
  }

  function select(option) {
    if (!state.sessionId) return;
    // The SERVER owns the echo: the option turn already prepends the
    // visitor's line, so the widget must not append its own copy.
    state.options = null;
    render();
    post({ type: 'option', sessionId: state.sessionId, optionIndex: option.index });
  }

  // ---- mount, session restore, pounce --------------------------------------

  function onScroll() {
    if (state.engaged || state.pounceTimer || state.sessionId) return;
    if (window.scrollY <= POUNCE_SCROLL_PX) return;
    state.pounceTimer = window.setTimeout(function () {
      state.pounceTimer = null;
      post({ type: 'start' }).then(function () {
        state.mode = 'card';
        render();
      });
    }, POUNCE_DELAY_MS);
  }

  function restore() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved) return;
    // Legibility aid: a live session silently suppresses the pounce (the
    // captured contract — no re-pounce), which reads as "the scroll gate never
    // fired" while testing. Say why, once.
    if (window.console && window.console.info) {
      window.console.info(
        '[flock] live chat session restored \u2014 pounce suppressed. ' +
          'Remove localStorage["flock-chat-session"] and reload to see the pounce.',
      );
    }
    post({ type: 'resume', sessionId: saved });
  }

  function mount() {
    if (!document.body || root) return;
    root = el('div', 'fpc-root');
    document.body.appendChild(root);
    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    restore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
