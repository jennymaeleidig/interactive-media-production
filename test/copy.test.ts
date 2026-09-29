// The piece's out-of-character copy, pinned.
//
// Two surfaces carry wording the artwork composes itself: the honest preview
// string (`og:title` / `og:description` / meta description) and the `?`
// disclosure's first sentence. The share kit (`docs/share.md`) quotes the same
// canonical string in prose. Pinning them here means a copy change fails a test
// instead of drifting silently across three deliverables.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISCLOSURE_SENTENCE, HONEST_DESCRIPTION, HONEST_FIRST_SENTENCE } from '../lib/share';

describe('the honest preview copy', () => {
  it('stands the one sentence alone, first', () => {
    expect(HONEST_FIRST_SENTENCE).toBe('An artwork, not Flock Safety.');
    expect(HONEST_DESCRIPTION.startsWith(HONEST_FIRST_SENTENCE)).toBe(true);
  });

  it('names the warn-then-proceed path without re-importing browser menus', () => {
    expect(HONEST_DESCRIPTION).toMatch(/Details/);
    expect(HONEST_DESCRIPTION).toMatch(/Chrome/);
    expect(HONEST_DESCRIPTION).toMatch(/Firefox|Zen/);
    // No URL in the preview; the report link lives in the share kit.
    expect(HONEST_DESCRIPTION).not.toMatch(/https?:\/\//);
  });
});

describe('the disclosure copy', () => {
  it('is the one plain sentence, non-affiliation and artwork together', () => {
    expect(DISCLOSURE_SENTENCE).toBe("This is not Flock Safety; it's an artwork.");
  });
});

describe('the scripted speakers', () => {
  // The cast pin: the script attributes its lines by name, and the two characters
  // the piece has are the ones CONTEXT.md declares. A re-attribution is a copy
  // change, so it fails here rather than drifting silently into the transcript.
  const script = readFileSync(path.join(process.cwd(), 'assets/dialogue/core.yarn'), 'utf8');

  it('greets in Cam’s voice and answers the general question as Flock', () => {
    expect(script).toMatch(/^Cam: Hey there!/m);
    expect(script).toMatch(/^Flock: I'm here to assist with any questions/m);
  });
});
