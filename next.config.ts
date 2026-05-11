import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker — emits .next/standalone with minimal deps
  output: 'standalone',
  experimental: {
    proxyClientMaxBodySize: '30mb',
  },
};

export default nextConfig;
