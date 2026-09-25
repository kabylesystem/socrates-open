import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 est un module NATIF : il ne doit pas être bundlé par
  // Turbopack en production (sinon « Module did not self-register »).
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      // Photos de copies manuscrites envoyées en base64 aux server actions
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
