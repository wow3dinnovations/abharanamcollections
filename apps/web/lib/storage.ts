/** Public URL for a photo in the "catalog" bucket, without needing a client instance. */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Only allow same-site relative redirects like "/bag". */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
