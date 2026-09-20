// The one canonical honest string, and the preview tags trimmed from it.
//
// `docs/share.md` is the share kit: the prose that travels with the link when it
// is pasted. This module is the same string in code, so the prose and the served
// `<head>` cannot drift. The split is deliberate (ticket 09): `<title>` stays in
// costume — the tab is part of the performance — while `og:title`,
// `og:description` and the meta description go honest, because an unfurl is
// fetched outside the frame and survives a browser warning.
//
// SPDX-License-Identifier: CC0-1.0

/** The one plain sentence, first, so a one-line preview still says the thing that matters. */
export const HONEST_FIRST_SENTENCE = 'An artwork, not Flock Safety.';

/** The honest trim the preview metadata carries. No URL: the report link lives in the kit. */
export const HONEST_DESCRIPTION =
  'An artwork, not Flock Safety. If your browser warns, use Details → proceed in Chrome; in Firefox or Zen, turn off deceptive-content blocking.';

/**
 * The disclosure's first-view sentence, pinned (ticket 04): non-affiliation and
 * the artwork statement in one plain sentence, out of character.
 */
export const DISCLOSURE_SENTENCE = "This is not Flock Safety; it's an artwork.";
