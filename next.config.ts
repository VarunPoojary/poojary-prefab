import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run alongside `next dev` without sharing the .next folder (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cache Components' "instant navigation" validation requires every route to have a server-renderable
  // static shell. Our auth and quotation data live entirely in the browser (sessionStorage) behind
  // client-only components (ssr:false), so validation fails with "Could not validate `instant`...".
  // We don't use any "use cache" directives yet, so there's nothing to lose by turning this off until
  // there's a real server-rendered session (see the Next.js "authentication with Cache Components" guide).
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
