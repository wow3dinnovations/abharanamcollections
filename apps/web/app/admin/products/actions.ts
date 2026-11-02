"use server";

import { revalidatePath } from "next/cache";
import { bool, check, optNum, requireAdmin, str } from "@/lib/admin";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function refresh(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}`);
  revalidatePath("/", "layout");
}

export async function toggleVisible(form: FormData) {
  const { supabase } = await requireAdmin();
  check(await supabase.from("products").update({ is_visible: bool(form, "value") }).eq("id", str(form, "id")));
  refresh(str(form, "id"));
}

export async function toggleFeatured(form: FormData) {
  const { supabase } = await requireAdmin();
  check(await supabase.from("products").update({ is_featured: bool(form, "value") }).eq("id", str(form, "id")));
  refresh(str(form, "id"));
}

export async function saveWebDetails(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const mrp = optNum(form, "mrp");
  check(
    await supabase
      .from("products")
      .update({ mrp, web_description: str(form, "web_description").slice(0, 4000), is_visible: bool(form, "is_visible"), is_featured: bool(form, "is_featured") })
      .eq("id", id),
  );
  refresh(id);
}

export async function uploadPhotos(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return;
  const { data: product } = check(await supabase.from("products").select("extra_image_paths").eq("id", id).single());
  const added: string[] = [];
  for (const file of files.slice(0, 8)) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) throw new Error("Photos must be JPG, PNG or WEBP");
    if (file.size > 8 * 1024 * 1024) throw new Error("Each photo must be under 8 MB");
    const path = `web/${id}/${crypto.randomUUID()}.${ext}`;
    check(await supabase.storage.from("catalog").upload(path, file, { contentType: file.type, cacheControl: "31536000" }));
    added.push(path);
  }
  check(await supabase.from("products").update({ extra_image_paths: [...(product?.extra_image_paths ?? []), ...added] }).eq("id", id));
  refresh(id);
}

export async function removePhoto(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const path = str(form, "path");
  const { data: product } = check(await supabase.from("products").select("extra_image_paths").eq("id", id).single());
  if (!product?.extra_image_paths.includes(path)) return;
  await supabase.storage.from("catalog").remove([path]);
  check(await supabase.from("products").update({ extra_image_paths: product.extra_image_paths.filter((p) => p !== path) }).eq("id", id));
  refresh(id);
}
