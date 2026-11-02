"use server";

import { revalidatePath } from "next/cache";
import { bool, check, requireAdmin, str } from "@/lib/admin";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function toggleCategory(form: FormData) {
  const { supabase } = await requireAdmin();
  check(await supabase.from("categories").update({ is_visible: bool(form, "value") }).eq("id", str(form, "id")));
  revalidatePath("/", "layout");
}

export async function saveCategory(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const update: { description: string; sort_order: number; image_path?: string } = {
    description: str(form, "description").slice(0, 500),
    sort_order: Math.max(0, Math.min(9999, Math.floor(Number(str(form, "sort_order")) || 100))),
  };
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) throw new Error("Photo must be JPG, PNG or WEBP");
    if (file.size > 8 * 1024 * 1024) throw new Error("Photo must be under 8 MB");
    const path = `categories/${id}/${crypto.randomUUID()}.${ext}`;
    check(await supabase.storage.from("catalog").upload(path, file, { contentType: file.type, cacheControl: "31536000" }));
    update.image_path = path;
  }
  check(await supabase.from("categories").update(update).eq("id", id));
  revalidatePath("/", "layout");
}
