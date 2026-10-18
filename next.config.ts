import type { NextConfig } from "next";

// All data access is handled securely by Supabase Auth + RLS in the browser.
// Static export makes deployment to free static hosting simple.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
