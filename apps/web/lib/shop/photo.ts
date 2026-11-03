"use client";

import { setShopPhoto } from "@/app/shop-admin/actions";
import { createClient } from "@/lib/supabase/browser";

/** Make a phone photo small enough for the website (longest side 1600 px, JPEG). */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is too large (over 8 MB).`);
    return file;
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo."))), "image/jpeg", 0.85),
  );
}

/** Upload a photo and make it the product's main photo (shown on the website too). */
export async function uploadProductPhoto(productId: string, sku: string, file: File) {
  const blob = await shrinkPhoto(file);
  const safe = sku.replace(/[^A-Za-z0-9_-]+/g, "-");
  const path = `shop/${safe}-${Date.now().toString(36)}.jpg`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("catalog")
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  const res = await setShopPhoto(productId, path);
  if (!res.ok) throw new Error(res.error);
}
