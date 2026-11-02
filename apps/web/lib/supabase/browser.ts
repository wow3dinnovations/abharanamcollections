import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@abh/db";

/** Supabase client for the browser, signed in as the current user through the same cookies as the server. */
export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
