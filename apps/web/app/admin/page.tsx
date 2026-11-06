import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHome() {
  const supabase = await createClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [newOrders, toShip, newEnq, openEnq, products, visible, soldOut, noPhoto, settings] = await Promise.all([
    count(supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "placed").or("payment_status.eq.paid,payment_method.eq.cod")),
    count(supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["confirmed", "packed"])),
    count(supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new")),
    count(supabase.from("enquiries").select("id", { count: "exact", head: true }).in("status", ["new", "contacted", "confirmed"])),
    count(supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true)),
    count(supabase.from("catalog").select("id", { count: "exact", head: true })),
    count(supabase.from("catalog").select("id", { count: "exact", head: true }).eq("in_stock", false)),
    count(supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).filter("image_paths", "eq", "{}").filter("extra_image_paths", "eq", "{}")),
    supabase.from("store_settings").select("last_sync_at").eq("id", 1).single(),
  ]);
  const last = settings.data?.last_sync_at;
  const stats: [string, number, string][] = [
    ["New orders", newOrders, "/admin/orders?status=placed"],
    ["Orders to ship", toShip, "/admin/orders?status=to_ship"],
    ["New enquiries", newEnq, "/admin/enquiries?status=new"],
    ["Open enquiries", openEnq, "/admin/enquiries"],
    ["On the website", visible, "/admin/products"],
    ["Active in shop", products, "/admin/products"],
    ["Sold out (shown)", soldOut, "/admin/products?stock=out"],
    ["Without a photo", noPhoto, "/admin/products?photo=none"],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map(([label, n, href]) => (
          <Link key={label} href={href} className="rounded-xl border border-cream bg-white p-4 hover:border-gold">
            <p className="text-3xl font-semibold text-maroon">{n}</p>
            <p className="text-sm text-muted">{label}</p>
          </Link>
        ))}
      </div>
      <Card title="Last publish from the shop software">
        <p className="text-sm">
          {last
            ? new Date(last).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
            : "Never. In the shop software open Administration → Website and press Publish now."}
        </p>
        <p className="mt-2 text-xs text-muted">
          Add products, print barcode tags and change stock in the shop software as usual. It publishes changes here automatically every few minutes.
        </p>
      </Card>
    </div>
  );
}
