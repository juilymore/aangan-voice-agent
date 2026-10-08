import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is off: every dashboard page is per-user, request-time data behind a login,
  // so there is no static shell worth prerendering.
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
