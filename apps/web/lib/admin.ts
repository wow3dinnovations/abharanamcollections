import { notFound } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

/** Supabase client for admin server actions. Stops non-admins before any query runs (RLS also enforces this). */
export async function requireAdmin() {
  const session = await getSessionProfile();
  if (!session?.isAdmin) notFound();
  return { supabase: await createClient(), user: session.user };
}

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function optNum(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a positive number`);
  return n;
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Throw a readable error when a Supabase call fails. */
export function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}
