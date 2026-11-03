import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Button, Input, PageHeader, Select, Table, Td } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { requireAdmin } from "@/lib/admin";
import { getMasters, searchTerm } from "@/lib/shop/server";

const PAGE = 50;

export default async function ShopProducts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; location?: string; vendor?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const masters = await getMasters();
  const page = Math.max(1, Number(sp.page) || 1);
  const q = searchTerm(sp.q ?? "");

  const shopJoin = sp.location || sp.vendor ? "shop_products!inner" : "shop_products";
  let query = supabase
    .from("products")
    .select(
      `id, sku, name, price, stock_qty, image_paths, is_active, added_at, categories(name),
       ${shopJoin}(barcode, purchase_rate, vendor_id, location_id, shop_vendors(name), shop_locations(name))`,
      { count: "exact" },
    )
    .order("added_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,design_number.ilike.%${q}%`);
  if (sp.category) query = query.eq("category_id", sp.category);
  if (sp.location) query = query.eq("shop_products.location_id", sp.location);
  if (sp.vendor) query = query.eq("shop_products.vendor_id", sp.vendor);
  const { data, count } = await query;
  // A barcode typed into the search box finds its product too.
  let rows = data ?? [];
  if (q && !rows.length) {
    const { data: byBarcode } = await supabase.from("shop_products").select("product_id").eq("barcode", q);
    if (byBarcode?.length) {
      const again = await supabase
        .from("products")
        .select(`id, sku, name, price, stock_qty, image_paths, is_active, added_at, categories(name),
          shop_products(barcode, purchase_rate, vendor_id, location_id, shop_vendors(name), shop_locations(name))`)
        .in("id", byBarcode.map((b) => b.product_id));
      rows = (again.data ?? []) as typeof rows;
    }
  }
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/shop-admin/products?${u}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`Products (${count ?? rows.length})`}>
        <Link href="/shop-admin/products/new" className="rounded bg-maroon px-3 py-1.5 text-sm font-medium text-white">Add product</Link>
      </PageHeader>
      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Code, name or barcode" className="w-56" />
        <Select name="category" defaultValue={sp.category ?? ""}>
          <option value="">All categories</option>
          {masters.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="vendor" defaultValue={sp.vendor ?? ""}>
          <option value="">All vendors</option>
          {masters.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select name="location" defaultValue={sp.location ?? ""}>
          <option value="">All locations</option>
          {masters.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Button variant="secondary">Search</Button>
      </form>

      <form action="/shop-admin/tags" method="get">
        <div className="mb-2 flex items-center gap-3">
          <Button>Print tags for ticked</Button>
          <span className="text-xs text-muted">Tick products, then print their tags.</span>
        </div>
        <Table head={["", "", "Code", "Name", "Category", "Vendor", "Bought at", "Rate", "Price", "Stock"]}>
          {rows.map((p) => (
            <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
              <Td><input type="checkbox" name="id" value={p.id} aria-label={`Tick ${p.sku}`} /></Td>
              <Td>
                <div className="h-10 w-10 overflow-hidden rounded border border-cream">
                  <ProductImage path={p.image_paths[0]} alt="" />
                </div>
              </Td>
              <Td><Link href={`/shop-admin/products/${p.id}`} className="font-medium underline">{p.sku}</Link></Td>
              <Td>{p.name} {!p.is_active && <Badge>Off</Badge>}</Td>
              <Td>{p.categories?.name ?? "–"}</Td>
              <Td>{p.shop_products?.shop_vendors?.name ?? "–"}</Td>
              <Td>{p.shop_products?.shop_locations?.name ?? "–"}</Td>
              <Td>{rupees(p.shop_products?.purchase_rate ?? 0)}</Td>
              <Td>{rupees(p.price)}</Td>
              <Td>{p.stock_qty > 0 ? p.stock_qty : <Badge tone="bad">0</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </form>
      {!rows.length && <p className="text-sm text-muted">No products found.</p>}
      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link(page - 1)} className="underline">← Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="underline">Next →</Link>}
        </nav>
      )}
    </div>
  );
}
