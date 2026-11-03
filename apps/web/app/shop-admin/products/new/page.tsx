import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/shop/ProductForm";
import { getMasters } from "@/lib/shop/server";

export default async function NewShopProduct() {
  const m = await getMasters();
  return (
    <div>
      <PageHeader title="Add product" />
      {(!m.categories.length || !m.locations.length) && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          First add {!m.categories.length ? "categories (Website admin → Categories)" : ""}
          {!m.categories.length && !m.locations.length ? " and " : ""}
          {!m.locations.length ? <>your shop locations (<Link className="underline" href="/shop-admin/setup">Vendors &amp; settings</Link>)</> : ""}, or{" "}
          <Link className="underline" href="/shop-admin/import">import the shop computer&apos;s data</Link>.
        </p>
      )}
      <ProductForm
        categories={m.categories}
        subcategories={m.subcategories}
        vendors={m.vendors}
        locations={m.locations}
        defaultMultiplier={Number(m.settings.default_multiplier)}
      />
    </div>
  );
}
