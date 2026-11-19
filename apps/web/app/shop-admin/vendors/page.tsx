import { redirect } from "next/navigation";

// Vendor performance moved into Analytics → Vendors. Old links and bookmarks still work.
export default async function VendorPerformance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; sort?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ view: "vendors" });
  if (sp.from) q.set("from", sp.from);
  if (sp.to) q.set("to", sp.to);
  if (sp.sort && sp.sort !== "amount") q.set("sort", sp.sort);
  redirect(`/shop-admin/analytics?${q}`);
}
