// window.flockParody — the story-hook seam (injected inline into every served page).
// Dormant in the Recreation: the runtime ships, nothing calls it. The parody
// phase's yarnspinner dialogue events drive it.
//
// Contract (fidelity-bar safe: DOM-only, no network):
//   window.flockParody.apply(patches) — patches: array of
//     { selector, text? | html? | src? | style? }
//   text  → el.textContent = text          (replace text)
//   html  → el.innerHTML = html            (replace subtree)
//   src   → el.setAttribute('src', src)    (swap media source)
//   style → Object.assign(el.style, style) (camelCase CSS properties)
// Patches apply in array order; a missing selector is skipped with a
// console.debug note and never throws; returns the number applied.
// Safe to call before DOM ready (calls queue until DOMContentLoaded).
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
      if (!el) { console.debug('[flockParody] no match:', p.selector); continue; }
      if ('text' in p) el.textContent = p.text;
      if ('html' in p) el.innerHTML = p.html;
      if ('src' in p) el.setAttribute('src', p.src);
      if (p.style) for (var k in p.style) el.style[k] = p.style[k];
      applied += 1;
    }
    return applied;
  }
  window.flockParody = {
    apply: function (patches) {
      if (document.readyState === 'loading') { queue.push(patches); return 0; }
      return run(patches);
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var q = queue.splice(0);
    for (var i = 0; i < q.length; i++) run(q[i]);
  });
})();
