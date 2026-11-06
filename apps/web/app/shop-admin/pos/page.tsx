import { PageHeader } from "@/components/admin/ui";
import { Pos } from "@/components/shop/Pos";
import { requireAdmin } from "@/lib/admin";

export default async function PosPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Billing" />
      <Pos />
    </div>
  );
}
