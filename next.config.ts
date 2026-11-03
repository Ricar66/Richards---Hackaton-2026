import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactStrictMode: true, serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"] };
export default nextConfig;
