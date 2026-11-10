"use client";

import { useState, useTransition } from "react";
import { tagPrintData } from "@/app/shop-admin/actions";
import { printHtml, tagSheetHtml } from "@/lib/shop/tags";

/** Prints the tags of these products right here (no new page or tab), with the saved tag size and layout. */
export function PrintTagButton({ ids, className, children }: { ids: string[]; className?: string; children?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending || !ids.length}
        className={className}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const d = await tagPrintData(ids);
              if (!d.items.length) return setError("Product not found.");
              printHtml(tagSheetHtml(d.items, d.width, d.height, d.brand, d.layout));
            } catch {
              setError("Could not print. Please try again.");
            }
          })
        }
      >
        {pending ? "Printing…" : (children ?? "Print tag")}
      </button>
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </>
  );
}
