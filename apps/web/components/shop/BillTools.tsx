"use client";

import { useEffect } from "react";

/** Print buttons for the bill page; opens the print window straight away after a new bill. */
export function BillTools({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);
  return (
    <button type="button" onClick={() => window.print()} className="rounded bg-maroon px-3 py-1.5 text-sm font-medium text-white">
      Print bill
    </button>
  );
}

/** Prints the page (reports). */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border border-cream bg-white px-3 py-1.5 text-sm font-medium hover:bg-cream print:hidden">
      {label}
    </button>
  );
}
