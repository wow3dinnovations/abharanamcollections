import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Pos } from "@/components/shop/Pos";
import { getMasters } from "@/lib/shop/server";

export default async function PosPage() {
  const m = await getMasters();
  const locations = m.locations.filter((l) => l.is_active).map((l) => ({ id: l.id, name: l.name }));
  return (
    <div>
      <PageHeader title="Billing" />
      {locations.length ? (
        <Pos locations={locations} />
      ) : (
        <p className="text-sm">Add your shop locations first in <Link href="/shop-admin/setup" className="underline">Vendors &amp; settings</Link>.</p>
      )}
    </div>
  );
}
