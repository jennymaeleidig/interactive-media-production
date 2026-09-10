import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The served tree is read from disk at request time by the catch-all route;
  // nothing here needs to be static or exported.
};

export default nextConfig;
