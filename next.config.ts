import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent @vapi-ai/web from being bundled for the server.
  // It uses browser-only APIs (AudioContext, WebRTC) and must only run client-side.
  serverExternalPackages: ["@vapi-ai/web"],
};

export default nextConfig;
