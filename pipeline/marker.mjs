// The marker on the Recreation's own bytes.
//
// Every style/script the Recreation injects carries `data-flock-parody="<layer>"`,
// and the strip census reads that attribute to tell our bytes from the
// Capture's. The marker has two sides — the build that used to stamp it and the
// audit that counts it (`pipeline/audit.mjs`) — so it lives here, on its own,
// and the census does not have to reach into a builder's table: importing that
// table for this one regex dragged the CSP helpers and `node:fs` into the
// serving check's module graph.
//
// SPDX-License-Identifier: CC0-1.0

/** The attribute every Recreation-injected style/script carries. */
export const MARKER_ATTR = 'data-flock-parody';

/** Matches any marked element — the script census's "injected" rule. */
export const MARKER_RE = new RegExp(`${MARKER_ATTR}=`, 'i');
