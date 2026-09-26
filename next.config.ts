import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: {
    position: "bottom-right",
  },
  // @ts-ignore - allowedDevOrigins is a valid experimental/dev option in recent Next.js
  allowedDevOrigins: ["172.17.174.194", "*.ngrok-free.app"],
  experimental: {
    serverActions: {
      allowedOrigins: ["172.17.174.194:3001", "localhost:3000", "*.ngrok-free.app"],
    },
  },
};

export default nextConfig;
