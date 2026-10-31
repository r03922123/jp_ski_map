import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8010";

// `pnpm dev:https` serves a phone on the LAN. Next's dev server blocks its own dev
// resources (HMR and the app's dev chunks) for any other host, which left the phone
// with a page that never started. Dev-only: this Mac's own addresses.
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .flatMap((i) => (i && i.family === "IPv4" && !i.internal ? [i.address] : []));

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1", ...lanHosts],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // SPEC-deploy: basic hardening for the public site. A full CSP is out of scope for now
  // (MapLibre's workers and OpenFreeMap tiles need careful tuning).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
  // The browser only ever talks to /api; upstream services stay behind the FastAPI service.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
