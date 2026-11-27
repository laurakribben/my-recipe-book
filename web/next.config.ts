import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are shrunk in the browser to ~1600 px before upload; 6 of them fit
      // comfortably. Vercel functions accept request bodies up to 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
