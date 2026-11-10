import { PageHeader } from "@/components/admin/ui";
import { TagPrinter } from "@/components/shop/TagPrinter";
import { getMasters, getStoreName, getTagItems } from "@/lib/shop/server";

export default async function TagsPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = Array.isArray(sp.id) ? sp.id : sp.id ? [sp.id] : [];
  const [m, store, items] = await Promise.all([getMasters(), getStoreName(), getTagItems(ids)]);
  return (
    <div>
      <PageHeader title="Print tags" />
      <TagPrinter initial={items} width={Number(m.settings.tag_width_mm)} height={Number(m.settings.tag_height_mm)} brand={store.name} layout={m.settings.tag_layout} />
    </div>
  );
}
