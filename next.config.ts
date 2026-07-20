import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile higher up the tree confuses Next's root inference; pin it here.
  turbopack: { root: __dirname },
};

export default nextConfig;
