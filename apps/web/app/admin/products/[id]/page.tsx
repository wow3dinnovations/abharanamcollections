import { rupees } from "@abh/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { createClient } from "@/lib/supabase/server";
import { removePhoto, saveWebDetails, uploadPhotos } from "../actions";

export default async function AdminProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("products").select("*, categories(name)").eq("id", id).maybeSingle();
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={p.name}>
        <Link href={`/products/${p.slug}`} className="text-sm underline">View on website</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="From the shop software (read-only here)">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">SKU</dt><dd>{p.sku}</dd>
            <dt className="text-muted">Category</dt><dd>{p.categories?.name ?? "–"}</dd>
            <dt className="text-muted">Selling price</dt><dd>{rupees(p.price)}</dd>
            <dt className="text-muted">Stock</dt><dd>{p.stock_qty}</dd>
            <dt className="text-muted">Collection</dt><dd>{p.collection || "–"}</dd>
            <dt className="text-muted">Colour</dt><dd>{p.colour || "–"}</dd>
            <dt className="text-muted">Description</dt><dd className="whitespace-pre-line">{p.description || "–"}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted">Change these in the shop software (Inventory → product → Edit). They are published here automatically.</p>
        </Card>
        <Card title="Website only">
          <form action={saveWebDetails} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <Field label="MRP / original price (shown crossed out, optional)">
              <Input name="mrp" type="number" min="0" step="1" defaultValue={p.mrp ?? ""} />
            </Field>
            <Field label="Extra description for the website">
              <Textarea name="web_description" rows={5} defaultValue={p.web_description} placeholder="Occasion, weight, length, what's in the set…" />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_visible" defaultChecked={p.is_visible} /> Show on website</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={p.is_featured} /> Featured (Bestsellers on home page)</label>
            <Button>Save</Button>
          </form>
        </Card>
      </div>
      <Card title="Photos">
        <div className="flex flex-wrap gap-3">
          {p.image_paths.map((path) => (
            <div key={path} className="w-28">
              <div className="aspect-square overflow-hidden rounded border border-cream"><ProductImage path={path} alt="" /></div>
              <p className="mt-1 text-xs text-muted">From shop</p>
            </div>
          ))}
          {p.extra_image_paths.map((path) => (
            <div key={path} className="w-28">
              <div className="aspect-square overflow-hidden rounded border border-cream"><ProductImage path={path} alt="" /></div>
              <form action={removePhoto}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="path" value={path} />
                <button className="mt-1 text-xs text-red-700 underline">Remove</button>
              </form>
            </div>
          ))}
        </div>
        <form action={uploadPhotos} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={p.id} />
          <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple className="text-sm" />
          <Button>Upload more photos</Button>
        </form>
        <p className="mt-2 text-xs text-muted">The main photo comes from the shop software. Add more angles or a model photo here (JPG/PNG/WEBP, up to 8 MB each).</p>
      </Card>
    </div>
  );
}
