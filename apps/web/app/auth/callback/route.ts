import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, landingAfterLogin } from "@/lib/supabase/server";
import { safeNext } from "@/lib/storage";

// Older login links (?code=...) and links sent before the email template was changed.
export async function GET(request: NextRequest) {
  const { searchParams, protocol } = new URL(request.url);
  // Use the host the browser actually used, so the session cookie and redirect match.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = `${request.headers.get("x-forwarded-proto") ?? protocol.replace(":", "")}://${host}`;
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${await landingAfterLogin(supabase, next)}`);
  } else if (tokenHash) {
    const type = (searchParams.get("type") ?? "email") as EmailOtpType;
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${await landingAfterLogin(supabase, next)}`);
  }
  // A link opened in a different browser or email app than the one that asked for it can't be used:
  // the code from the same email still works.
  return NextResponse.redirect(
    `${origin}/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(
      "That link only works in the browser where you asked for it. Enter your email again and type the 6-digit code instead.",
    )}`,
  );
}
