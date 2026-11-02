// Keeps the login in on-device storage (SQLite) so customers stay signed in between launches.
import "expo-sqlite/localStorage/install";
import type { Database } from "@abh/db";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env.local");
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("catalog").getPublicUrl(path).data.publicUrl;
}

/** Website pages (policies, contact) the app links to. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
