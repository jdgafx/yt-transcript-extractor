import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jspdf"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
