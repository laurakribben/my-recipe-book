import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are shrunk in the browser to ~1600 px before upload; 6 of them fit
      // comfortably. Vercel functions accept request bodies up to 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
  images: {
    // Recipe pictures from the Supabase storage bucket (see lib/images.ts). next/image
    // serves them resized, so the recipe list loads small thumbnails.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/recipe-images/**" },
    ],
  },
};

export default nextConfig;
