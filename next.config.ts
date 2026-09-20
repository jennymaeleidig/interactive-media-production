// SPDX-License-Identifier: CC0-1.0
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The piece is static: one page, one published file, no server. The export
  // writes the whole site into `out/` — which is also what turns the asset
  // route's declarations into real files under `out/chat/` — so any host that
  // serves a directory can serve it.
  output: 'export',
  // `next build` walks upward from the repo looking for lockfiles and finds an
  // unrelated one in the home directory above it, so it warns that it guessed
  // the workspace root. npm runs these scripts from the package directory, so
  // say what the root is instead of letting it guess.
  outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;
