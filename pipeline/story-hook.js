// SPDX-License-Identifier: CC0-1.0
// The story-hook seam runtime — injected inline into every served page by the
// build (pipeline/build.mjs, ticket 03). Dormant in the Recreation: the
// runtime ships, nothing calls it; the Parody layer's dialogue events will
// drive it (spec, Implementation Decisions → Story-hook seam; contract
// ratified in ticket 05 of the flock-parody effort, proven in that effort's
// snapshot-serving prototype — both in git history).
//
// Contract:
//   window.flockParody.apply(patches)
//   patches: [{ selector, text? | html? | src? | style? }, …]
//     text  → el.textContent = text        (replace text)
//     html  → el.innerHTML = html          (replace subtree)
//     src   → el.setAttribute('src', src)  (swap a media source)
//     style → merge camelCase props onto el.style
//   • Applied in array order — a later patch sees an earlier patch's DOM.
//   • A patch counts as applied when its selector resolves (first match).
//   • A missing selector is skipped with a console.debug note — never throws.
//   • Called while the document is loading, the list queues and applies at
//     DOMContentLoaded (apply itself returns 0 while queued).
//   • DOM-only: the seam never touches the network — the zero-outbound
//     invariant (CODING_STANDARDS.md); the test suite enforces the exact
//     primitive list.
// This file is read as text and inlined verbatim into served bytes; keep it
// free of any closing-script markup and free of page copy — code-owned
// strings only.
(function () {
  'use strict';
  var queue = [];

  function run(patches) {
    var applied = 0;
    if (!Array.isArray(patches)) return applied;
    for (var i = 0; i < patches.length; i++) {
      var p = patches[i];
      if (!p || !p.selector) continue;
      var el = document.querySelector(p.selector);
      if (!el) {
        console.debug('[flockParody] selector not found, patch skipped:', p.selector);
        continue;
      }
      if (p.text !== undefined) el.textContent = p.text;
      if (p.html !== undefined) el.innerHTML = p.html;
      if (p.src !== undefined) el.setAttribute('src', p.src);
      if (p.style) for (var k in p.style) el.style[k] = p.style[k];
      applied += 1;
    }
    return applied;
  }

  window.flockParody = {
    apply: function (patches) {
      if (document.readyState === 'loading') {
        queue.push(patches);
        return 0;
      }
      return run(patches);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var pending = queue.splice(0);
    for (var i = 0; i < pending.length; i++) run(pending[i]);
  });
})();
