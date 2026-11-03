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

export function CancelBill({ id, action }: { id: string; action: (form: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Cancel this bill? Its items go back into stock.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Cancel bill</button>
    </form>
  );
}
