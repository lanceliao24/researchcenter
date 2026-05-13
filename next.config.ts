import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker — emits .next/standalone with minimal deps
  output: 'standalone',
  // Native bindings can't go through Turbopack's bundler; require() them
  // at runtime instead.
  serverExternalPackages: ['@node-rs/jieba'],
  experimental: {
    proxyClientMaxBodySize: '30mb',
  },
};

export default nextConfig;
