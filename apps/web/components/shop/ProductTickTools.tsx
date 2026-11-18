"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteProducts } from "@/app/shop-admin/actions";
import { Button } from "@/components/admin/ui";

/**
 * Products list, above the table: Select all, Print tags for ticked and Delete ticked.
 * Works on the checkboxes named "id" in the same form.
 */
export function ProductTickTools() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const all = useRef<HTMLInputElement>(null);
  const [ticked, setTicked] = useState(0);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const boxes = () => Array.from(box.current?.closest("form")?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"]') ?? []);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const count = () => {
      const list = boxes();
      const n = list.filter((b) => b.checked).length;
      setTicked(n);
      setTotal(list.length);
      if (all.current) {
        all.current.checked = n > 0 && n === list.length;
        all.current.indeterminate = n > 0 && n < list.length;
      }
    };
    count();
    form.addEventListener("change", count);
    // The list changes after a delete or a new page: count again.
    const watch = new MutationObserver(count);
    watch.observe(form, { childList: true, subtree: true });
    return () => {
      form.removeEventListener("change", count);
      watch.disconnect();
    };
  }, []);

  const tickAll = (on: boolean) => {
    for (const b of boxes()) b.checked = on;
    box.current?.closest("form")?.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const remove = () => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    if (!ids.length) return;
    const msg = `Delete ${ids.length === 1 ? "this product" : `these ${ids.length} products`}?\n\n` +
      "A product that was never sold is removed for good. A product that is on a bill is hidden and its stock set to 0, so old bills and reports stay right.";
    if (!window.confirm(msg)) return;
    setNote(null);
    start(async () => {
      const res = await deleteProducts(ids);
      if (!res.ok) {
        setNote({ ok: false, text: res.error });
        return;
      }
      const parts = [];
      if (res.removed) parts.push(`${res.removed} deleted`);
      if (res.hidden) parts.push(`${res.hidden} on old bills hidden (stock set to 0)`);
      setNote({ ok: true, text: `${parts.join(", ")}.` });
      tickAll(false);
      router.refresh();
    });
  };

  return (
    <div ref={box} className="mb-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input ref={all} type="checkbox" disabled={!total} onChange={(e) => tickAll(e.target.checked)} aria-label="Select all products on this page" />
          Select all{ticked ? ` (${ticked} ticked)` : ""}
        </label>
        <Button disabled={!ticked || pending}>Print tags for ticked</Button>
        <Button type="button" variant="danger" disabled={!ticked || pending} onClick={remove}>
          {pending ? "Deleting…" : "Delete ticked"}
        </Button>
        <span className="text-xs text-muted">Tick products, then print their tags or delete them.</span>
      </div>
      {note && (
        <p role="status" className={`rounded border p-2 text-sm ${note.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-800"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
