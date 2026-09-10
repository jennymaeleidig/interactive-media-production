import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PROTOTYPE: the whole question is whether the SSR load path is
  // bundler-agnostic (it must need zero bundler config). The only pin here is
  // the tracing root: the repo root has its own package-lock.json, and
  // without this Next mis-infers the workspace root and loses the routes.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
