import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@abh/db";

/** Supabase with the service_role key: only for the payment steps that customers must not be able to do
 *  themselves (linking a Razorpay order, marking an order paid). The key is a Cloudflare secret
 *  (SUPABASE_SERVICE_ROLE_KEY) and never reaches the browser. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Online payment is not set up: SUPABASE_SERVICE_ROLE_KEY is missing on the server.");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
