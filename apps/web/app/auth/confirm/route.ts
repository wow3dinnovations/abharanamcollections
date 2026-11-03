import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/storage";

// The login link in the email: /auth/confirm?token_hash=...&type=email&next=/account
// Works in any browser or email app (unlike /auth/callback, which only works in the browser that asked for it).
export async function GET(request: NextRequest) {
  const { searchParams, protocol } = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = `${request.headers.get("x-forwarded-proto") ?? protocol.replace(":", "")}://${host}`;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNext(searchParams.get("next"));
  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(
    `${origin}/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(
      "That login link has expired or was already used. Enter your email to get a new code.",
    )}`,
  );
}
