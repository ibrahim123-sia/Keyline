import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Separate build folder for the e2e server, so it can run next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // The e2e dev server always starts cold: a restored dev cache next to files edited since
    // (e.g. by the formatter) sent the browser into an endless reload loop.
    turbopackFileSystemCacheForDev: process.env.NEXT_DIST_DIR !== ".next-e2e",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // `pg` loads `pg-cloudflare` only under the `workerd` export condition, which Node's file
  // tracing never resolves; include its files so the Workers bundle (OpenNext) can find them.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/pg-cloudflare@*/node_modules/pg-cloudflare/dist/**/*",
      "./node_modules/.pnpm/pg-cloudflare@*/node_modules/pg-cloudflare/esm/**/*",
    ],
  },
  images: {
    // Media is served by our own /media route (R2 in production, local disk in development).
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/images/**" }],
    qualities: [60, 75, 90],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
