// The serving layer's miss body, in one place. The Next host answers an unknown
// path with these exact bytes (`lib/serving.ts` `notFound`), and the publish
// artifact's single `404.html` must carry the same bytes so a static host's miss
// lands on the same words the Recreation shows locally. The two readers cannot
// drift because they read the same constant.
//
// SPDX-License-Identifier: CC0-1.0

/** The body the serving layer returns for a path it has no page or redirect for. */
export const NOT_FOUND_BODY = 'Not found';
