import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/storage";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/shop-admin", "/account", "/bag", "/wishlist", "/login"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
