import { Button, Input, PageHeader, Table, Td, ToggleForm } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { createClient } from "@/lib/supabase/server";
import { saveCategory, toggleCategory } from "./actions";

export default async function AdminCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order").order("name");
  return (
    <div>
      <PageHeader title="Categories" />
      <p className="mb-4 text-sm text-muted">Categories are added and named in the shop software (Vendors &amp; settings). Here you choose the order, a cover photo and a short description for the website.</p>
      <Table head={["Photo", "Category", "Order / description / photo", "On website"]}>
        {(data ?? []).map((c) => (
          <tr key={c.id}>
            <Td><div className="h-14 w-14 overflow-hidden rounded-full border border-cream"><ProductImage path={c.image_path} alt="" /></div></Td>
            <Td>{c.name}<br /><span className="text-xs text-muted">{c.code}{!c.is_active && " · inactive in shop"}</span></Td>
            <Td>
              <form action={saveCategory} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Input name="sort_order" type="number" defaultValue={c.sort_order} className="w-20" aria-label="Order" />
                <Input name="description" defaultValue={c.description} placeholder="Short description" className="w-56" />
                <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="w-48 text-xs" aria-label="Cover photo" />
                <Button variant="secondary">Save</Button>
              </form>
            </Td>
            <Td><ToggleForm action={toggleCategory} id={c.id} on={c.is_visible} labelOn="Shown" labelOff="Hidden" /></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
