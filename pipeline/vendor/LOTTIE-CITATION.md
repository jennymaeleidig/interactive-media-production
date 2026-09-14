# Citation: Airbnb — lottie-web (v5.13.0) [MIT]
# Source: https://unpkg.com/lottie-web@5.13.0/build/player/lottie.min.js
# Accessed: 2026-09-14
#
# The unmodified player is vendored at `pipeline/vendor/lottie.min.js` (sha256
# 2eb762973aec914d981f426123040bfac9d26217239605e225ddc7cee17618ac, 305,704 B).
# It is never edited in place: `pipeline/build-lottie-layers.mjs` reads it,
# applies the two documented neuters for `pipeline/injected-source.mjs`'s
# `isInertSource` rule, and writes the result once to
# `pipeline/lottie/player.runtime.js` — one shared asset the roster ships ahead of
# the generated `pipeline/lottie/<name>.runtime.js` data layers that use its
# `window.lottie`. The upstream project is
# https://github.com/airbnb/lottie-web.
#
# SPDX-License-Identifier: CC0-1.0
