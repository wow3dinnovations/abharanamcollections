import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, PageHeader, Table, Td, ToggleForm } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { createClient } from "@/lib/supabase/server";
import { toggleFeatured, toggleVisible } from "./actions";

type SP = { q?: string; stock?: string; photo?: string; show?: string; page?: string };
const PAGE = 50;

export default async function AdminProducts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q = supabase
    .from("products")
    .select("id, sku, name, slug, price, mrp, stock_qty, image_paths, extra_image_paths, is_active, is_visible, is_featured, categories(name)", { count: "exact" })
    .order("added_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const term = (sp.q ?? "").replace(/[^a-zA-Z0-9 ._-]/g, "").trim();
  if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  if (sp.stock === "out") q = q.eq("stock_qty", 0);
  if (sp.photo === "none") q = q.filter("image_paths", "eq", "{}").filter("extra_image_paths", "eq", "{}");
  if (sp.show === "hidden") q = q.eq("is_visible", false);
  if (sp.show === "inactive") q = q.eq("is_active", false);
  else q = q.eq("is_active", true);
  const { data, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (change: Partial<SP>) => `/admin/products?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...change }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div>
      <PageHeader title={`Products (${count ?? 0})`}>
        <form className="flex gap-2">
          <input name="q" defaultValue={sp.q} placeholder="Name or SKU" className="rounded border border-cream px-2 py-1.5 text-sm" />
        </form>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[
          ["All", {}],
          ["Sold out", { stock: "out" }],
          ["No photo", { photo: "none" }],
          ["Hidden from website", { show: "hidden" }],
          ["Inactive in shop", { show: "inactive" }],
        ].map(([label, change]) => (
          <Link key={label as string} href={link({ stock: undefined, photo: undefined, show: undefined, ...(change as Partial<SP>) })} className="rounded-full bg-cream px-3 py-1">
            {label as string}
          </Link>
        ))}
      </div>
      <Table head={["", "Product", "Price", "Stock", "On website", "Featured"]}>
        {(data ?? []).map((p) => (
          <tr key={p.id}>
            <Td><div className="h-12 w-12 overflow-hidden rounded"><ProductImage path={[...p.image_paths, ...p.extra_image_paths][0]} alt="" /></div></Td>
            <Td>
              <Link href={`/admin/products/${p.id}`} className="font-medium underline">{p.name}</Link>
              <br /><span className="text-xs text-muted">{p.sku} · {p.categories?.name ?? "No category"}</span>
              {!p.is_active && <> <Badge tone="bad">inactive in shop</Badge></>}
            </Td>
            <Td>{rupees(p.price)}{p.mrp ? <><br /><s className="text-xs text-muted">{rupees(p.mrp)}</s></> : null}</Td>
            <Td>{p.stock_qty > 0 ? p.stock_qty : <Badge tone="warn">0</Badge>}</Td>
            <Td><ToggleForm action={toggleVisible} id={p.id} on={p.is_visible} labelOn="Shown" labelOff="Hidden" /></Td>
            <Td><ToggleForm action={toggleFeatured} id={p.id} on={p.is_featured} labelOn="Yes" labelOff="No" /></Td>
          </tr>
        ))}
      </Table>
      {pages > 1 && (
        <div className="mt-4 flex gap-3 text-sm">
          {page > 1 && <Link className="underline" href={link({ page: String(page - 1) })}>← Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="underline" href={link({ page: String(page + 1) })}>Next →</Link>}
        </div>
      )}
    </div>
  );
}
