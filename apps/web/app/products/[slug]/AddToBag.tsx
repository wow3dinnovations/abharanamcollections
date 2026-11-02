"use client";
import Link from "next/link";
import { useState } from "react";
import { bag, useBag } from "@/lib/local";

type P = { id: string; sku: string; name: string; price: number; slug: string; inStock: boolean };

export function AddToBag({ p }: { p: P }) {
  const lines = useBag();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const inBag = lines.find((l) => l.productId === p.id)?.quantity ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full border border-cream bg-white">
          <button type="button" className="px-3 py-2 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Less">−</button>
          <span className="w-8 text-center" aria-live="polite">{qty}</span>
          <button type="button" className="px-3 py-2 text-lg" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="More">+</button>
        </div>
        <button
          type="button"
          onClick={() => {
            bag.add({ productId: p.id, sku: p.sku, name: p.name, price: p.price, quantity: qty, slug: p.slug });
            setAdded(true);
          }}
          className="flex-1 rounded-full bg-maroon px-6 py-3 text-sm font-semibold text-white hover:bg-maroon-dark"
        >
          {p.inStock ? "Add to enquiry bag" : "Request this design"}
        </button>
      </div>
      {(added || inBag > 0) && (
        <p className="text-sm text-green-800" role="status">
          {inBag} in your bag. <Link href="/bag" className="font-medium underline">View bag & send enquiry</Link>
        </p>
      )}
    </div>
  );
}
