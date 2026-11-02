import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const [{ data: products }, { data: cats }] = await Promise.all([
    supabase.from("catalog").select("slug, added_at").limit(5000),
    supabase.from("category_summary").select("slug"),
  ]);
  const pages = ["", "/shop", "/categories", "/about", "/contact", "/how-to-order", "/care", "/faq"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}` })),
    ...(cats ?? []).map((c) => ({ url: `${SITE_URL}/shop?category=${c.slug}` })),
    ...(products ?? []).map((p) => ({ url: `${SITE_URL}/products/${p.slug}`, lastModified: p.added_at })),
  ];
}
