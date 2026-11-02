import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams, protocol } = new URL(request.url);
  // Use the host the browser actually used, so the session cookie and redirect match.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = `${request.headers.get("x-forwarded-proto") ?? protocol.replace(":", "")}://${host}`;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${origin}/login?error=Login+link+expired+or+invalid`);
}
