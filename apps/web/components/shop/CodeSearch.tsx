"use client";

import { rupees } from "@abh/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { codeHints, type CodeHint } from "@/app/shop-admin/actions";

/** "Find a product code or barcode": shows matching codes while typing (IH1 -> IH12, IH13...; IH12 -> IH123, IH124...).
 *  Choosing one (or pressing Enter) opens it on the shop dashboard. */
export function CodeSearch({ initial = "", compact = false, autoFocus = false }: { initial?: string; compact?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [term, setTerm] = useState(initial);
  const [hints, setHints] = useState<CodeHint[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const path = usePathname();

  useEffect(() => setTerm(initial), [initial]);

  // Ask for matches a moment after the last key (a scanner types the whole code at once).
  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setHints([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      codeHints(q)
        .then((r) => {
          if (!live) return;
          setHints(r);
          setActive(-1);
        })
        .catch(() => {});
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setTerm(c);
    setOpen(false);
    router.push(`/shop-admin?code=${encodeURIComponent(c)}`);
  };

  const show = open && hints.length > 0;
  // The shop dashboard has the big search box already.
  if (compact && path === "/shop-admin") return <span className="flex-1" />;

  return (
    <div ref={box} className={`relative min-w-0 ${compact ? "w-full max-w-xs" : "flex-1"}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(active >= 0 && hints[active] ? hints[active].sku : term);
        }}
        className={compact ? "" : "flex flex-wrap items-end gap-2"}
      >
        <label className={compact ? "block" : "flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wider text-muted"}>
          <span className={compact ? "sr-only" : ""}>Find a product code or barcode</span>
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value.toUpperCase());
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && hints.length) {
                e.preventDefault();
                setOpen(true);
                setActive((a) => (a + 1) % hints.length);
              } else if (e.key === "ArrowUp" && hints.length) {
                e.preventDefault();
                setActive((a) => (a <= 0 ? hints.length - 1 : a - 1));
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder={compact ? "Find code or barcode…" : "IH123"}
            autoComplete="off"
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            className={
              compact
                ? "w-full rounded-md border border-cream bg-white px-3 py-1.5 font-mono text-sm uppercase text-ink"
                : "rounded-md border border-cream px-3 py-2 font-mono text-lg uppercase text-ink"
            }
          />
        </label>
        {!compact && <button className="rounded-md bg-maroon px-4 py-2.5 text-sm font-medium text-white">Check stock</button>}
      </form>
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-cream bg-white text-sm shadow-lg"
        >
          {hints.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h.sku)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-cream" : ""}`}
              >
                <b className="w-24 shrink-0 font-mono">{h.sku}</b>
                <span className="min-w-0 flex-1 truncate text-muted">{h.name}</span>
                <span className="shrink-0">{rupees(h.price)}</span>
                <span className={`w-16 shrink-0 text-right text-xs ${h.stock_qty > 0 ? "text-green-700" : "text-red-700"}`}>
                  {h.stock_qty} in stock
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
