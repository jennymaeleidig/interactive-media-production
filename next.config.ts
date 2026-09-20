// SPDX-License-Identifier: CC0-1.0
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The piece is static: one page, two published files, no server. The export
  // writes the whole site into `out/` — which is also what turns the asset
  // route's declarations into real files under `out/chat/` — so any host that
  // serves a directory can serve it.
  output: 'export',
};

export default nextConfig;
