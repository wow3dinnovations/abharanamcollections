import { PageHeader } from "@/components/admin/ui";
import { Importer } from "@/components/shop/Importer";
import { requireAdmin } from "@/lib/admin";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Import shop data" />
      <p className="mb-4 text-sm">
        Brings the products, stock, vendors and locations from the shop computer&apos;s software into this online shop software.
        It is safe to run again: products are matched by their shop id, so they are updated, not doubled. Stock numbers from the files replace the stock here.
      </p>
      <Importer />
    </div>
  );
}
