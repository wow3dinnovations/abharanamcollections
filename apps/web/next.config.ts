import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const PUBLIC_SETTINGS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL"] as const;

export default function config(phase: string): NextConfig {
  const missing = PUBLIC_SETTINGS.filter((k) => !process.env[k]);
  const building = phase === PHASE_PRODUCTION_BUILD && process.argv.includes("build"); // not `next typegen`
  if (building && missing.includes("NEXT_PUBLIC_SUPABASE_URL")) {
    throw new Error(
      `Missing ${missing.join(", ")}. Add them as Build variables (Cloudflare → Worker → Settings → Build), ` +
        "see docs/GO-LIVE.md step 2.",
    );
  }
  return {
    transpilePackages: ["@abh/core", "@abh/db"],
    // Bake the public settings into every bundle at build time. The proxy (middleware) otherwise reads them
    // at run time, where the Cloudflare Worker doesn't have them, and every page fails with error 1101.
    env: Object.fromEntries(PUBLIC_SETTINGS.filter((k) => process.env[k]).map((k) => [k, process.env[k] as string])),
    experimental: {
      // Product and category photos are uploaded through admin server actions.
      serverActions: { bodySizeLimit: "9mb" },
    },
  };
}
