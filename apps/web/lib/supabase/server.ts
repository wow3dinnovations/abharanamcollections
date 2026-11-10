import { createServerClient } from "@supabase/ssr";
import type { Database } from "@abh/db";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/** The signed-in user and their role, or null when signed out. */
export async function getSessionProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();
  return { user, profile, isAdmin: profile?.role === "admin" };
}

/** Where to go after logging in: the shop admin lands on the shop software (with the code search),
 *  unless the login was started from a particular page. */
export async function landingAfterLogin(supabase: Awaited<ReturnType<typeof createClient>>, next: string): Promise<string> {
  if (next !== "/account" && next !== "/") return next;
  // The client that just logged in already holds the new session.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return next;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? "/shop-admin" : next;
}
