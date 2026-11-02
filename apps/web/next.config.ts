import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@abh/core", "@abh/db"],
  experimental: {
    // Product and category photos are uploaded through admin server actions.
    serverActions: { bodySizeLimit: "9mb" },
  },
};

export default nextConfig;
