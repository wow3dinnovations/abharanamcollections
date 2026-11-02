"use client";
// The enquiry bag and wishlist live on the customer's device (no login needed).
import { addToBag, setQuantity, type BagLine } from "@abh/core";
import { useSyncExternalStore } from "react";

function makeStore<T>(key: string, fallback: T) {
  let cache: T | null = null;
  let raw: string | null = null;
  const listeners = new Set<() => void>();

  const read = (): T => {
    if (typeof window === "undefined") return fallback;
    let next: string | null = null;
    try {
      next = window.localStorage.getItem(key);
    } catch {
      next = null;
    }
    if (cache !== null && next === raw) return cache;
    raw = next;
    try {
      cache = next ? (JSON.parse(next) as T) : fallback;
    } catch {
      cache = fallback;
    }
    return cache;
  };

  const write = (value: T) => {
    cache = value;
    raw = JSON.stringify(value);
    try {
      window.localStorage.setItem(key, raw);
    } catch {
      // Private mode or storage full: keep it in memory for this visit.
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => e.key === key && l();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };

  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { read, write, use };
}

const EMPTY_BAG: BagLine[] = [];
const EMPTY_LIST: string[] = [];
const bagStore = makeStore<BagLine[]>("abh.bag.v1", EMPTY_BAG);
const wishStore = makeStore<string[]>("abh.wishlist.v1", EMPTY_LIST);

export const useBag = bagStore.use;
export const bag = {
  add: (line: BagLine) => bagStore.write(addToBag(bagStore.read(), line)),
  setQty: (id: string, qty: number) => bagStore.write(setQuantity(bagStore.read(), id, qty)),
  clear: () => bagStore.write([]),
  /** Drop lines whose product is no longer on the website, and refresh names and prices. */
  refresh: (live: { id: string; name: string; price: number; sku: string; slug: string }[]) => {
    const byId = new Map(live.map((p) => [p.id, p]));
    const current = bagStore.read();
    const next = current
      .filter((l) => byId.has(l.productId))
      .map((l) => {
        const p = byId.get(l.productId)!;
        return { ...l, name: p.name, price: Number(p.price), sku: p.sku, slug: p.slug };
      });
    if (JSON.stringify(next) !== JSON.stringify(current)) bagStore.write(next);
  },
};

export const useWishlist = wishStore.use;
export const wishlist = {
  toggle: (id: string) => {
    const list = wishStore.read();
    wishStore.write(list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 100));
  },
  remove: (id: string) => wishStore.write(wishStore.read().filter((x) => x !== id)),
};
