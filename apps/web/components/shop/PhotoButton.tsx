"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadProductPhoto } from "@/lib/shop/photo";

export function PhotoButton({ productId, sku }: { productId: string; sku: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="mt-2 text-sm">
      <label className="inline-block cursor-pointer rounded border border-cream bg-white px-3 py-1.5 font-medium hover:bg-stone-100">
        {pending ? "Uploading…" : "Change photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            start(async () => {
              try {
                await uploadProductPhoto(productId, sku, file);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed.");
              }
            });
          }}
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
