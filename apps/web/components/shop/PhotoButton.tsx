"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhotoPicker } from "@/components/shop/PhotoPicker";
import { uploadProductPhoto } from "@/lib/shop/photo";

export function PhotoButton({ productId, sku }: { productId: string; sku: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="mt-2 text-sm">
      {pending ? (
        <span className="text-muted">Uploading…</span>
      ) : (
        <PhotoPicker
          showPreview={false}
          onPick={(file) => {
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
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
