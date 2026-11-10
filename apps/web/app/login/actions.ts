"use server";

import { redirect } from "next/navigation";
import { createClient, landingAfterLogin } from "@/lib/supabase/server";
import { safeNext } from "@/lib/storage";

function friendly(message: string): string {
  if (/rate limit|too many|seconds/i.test(message)) return "Please wait a minute before asking for another code.";
  if (/expired|invalid/i.test(message)) return "That code is wrong or has expired. Ask for a new one.";
  if (/sending|smtp|mail/i.test(message)) return "We couldn't send the email just now. Please try again in a few minutes.";
  return message;
}

/** Step 1: email a 6-digit login code (the email also has a link, for convenience). */
export async function sendLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = `/login?next=${encodeURIComponent(next)}`;
  if (!email) redirect(`${back}&error=Enter+your+email`);

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`${back}&error=${encodeURIComponent(friendly(error.message))}`);
  redirect(`${back}&email=${encodeURIComponent(email)}`);
}

/** Step 2: check the code from the email and log in. */
export async function verifyLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = `/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`;
  if (!email) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (token.length < 6) redirect(`${back}&error=Enter+the+code+from+the+email`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`${back}&error=${encodeURIComponent(friendly(error.message))}`);
  redirect(await landingAfterLogin(supabase, next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
