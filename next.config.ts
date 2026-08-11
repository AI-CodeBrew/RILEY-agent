import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server blocks cross-origin requests to JS assets/HMR by default,
  // which breaks client hydration (forms fall back to native GET submits)
  // when the app is reached via a LAN/VPN IP instead of localhost.
  allowedDevOrigins: ["26.91.139.154"],
  // An unrelated package.json/lockfile in the parent user folder was making
  // Turbopack infer the wrong workspace root, which broke route resolution
  // and pulled in a second copy of React. Pin the root explicitly.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
