// The one route rule the serving layer and the forms route share: a redirect
// target is local iff it is a root-relative, non-protocol-relative path.
// Anything else would leave the machine (zero-outbound invariant), so both
// readers of a build-authored target apply the same predicate and cannot drift.
//
// The manifest that used to feed this (the capture run's
// `manifest-uncaptured.csv`, parsed into route classes) is gone with the
// captures; the tree it produced is committed, and this predicate is what
// reading it still needs.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * @param {unknown} target
 * @returns {target is string}
 */
export function isLocalTarget(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//');
}
