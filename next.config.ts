import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server blocks cross-origin requests to JS assets/HMR by default,
  // which breaks client hydration (forms fall back to native GET submits)
  // when the app is reached via a LAN/VPN IP instead of localhost.
  allowedDevOrigins: ["26.91.139.154"],
};

export default nextConfig;
