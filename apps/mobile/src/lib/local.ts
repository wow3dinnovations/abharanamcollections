// Enquiry bag and wishlist, saved on the phone (no login needed). Same rules as the website.
import "expo-sqlite/localStorage/install";
import { addToBag, setQuantity, type BagLine } from "@abh/core";
import { useSyncExternalStore } from "react";

function makeStore<T>(key: string, fallback: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache !== null) return cache;
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      cache = fallback;
    }
    return cache;
  };
  const write = (value: T) => {
    cache = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // keep in memory
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const use = () => useSyncExternalStore(subscribe, read, read);
  return { read, write, use };
}

const bagStore = makeStore<BagLine[]>("abh.bag.v1", []);
const wishStore = makeStore<string[]>("abh.wishlist.v1", []);

export const useBag = bagStore.use;
export const bag = {
  add: (line: BagLine) => bagStore.write(addToBag(bagStore.read(), line)),
  setQty: (id: string, qty: number) => bagStore.write(setQuantity(bagStore.read(), id, qty)),
  clear: () => bagStore.write([]),
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
};
