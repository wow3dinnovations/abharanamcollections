"use client";
import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";

export function Gallery({ paths, alt, label }: { paths: string[]; alt: string; label?: string | null }) {
  const [i, setI] = useState(0);
  return (
    <div className="space-y-3">
      <div className="aspect-square overflow-hidden rounded-xl border border-cream bg-white">
        <ProductImage path={paths[i]} alt={alt} label={label} eager />
      </div>
      {paths.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {paths.map((p, n) => (
            <button
              key={p}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Photo ${n + 1}`}
              aria-current={n === i}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 ${n === i ? "border-gold" : "border-transparent"}`}
            >
              <ProductImage path={p} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
