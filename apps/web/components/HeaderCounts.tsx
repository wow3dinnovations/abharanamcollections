"use client";
import { bagTotal } from "@abh/core";
import Link from "next/link";
import { useBag, useWishlist } from "@/lib/local";

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-maroon px-1 text-center text-[10px] font-semibold leading-4 text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function HeaderCounts() {
  const bag = useBag();
  const wish = useWishlist();
  const { count } = bagTotal(bag);
  return (
    <>
      <Link href="/wishlist" className="relative p-1" aria-label={`Wishlist, ${wish.length} items`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
        </svg>
        <Count n={wish.length} />
      </Link>
      <Link href="/bag" className="relative p-1" aria-label={`Bag, ${count} pieces`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M5 8h14l-1.2 12H6.2L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
        <Count n={count} />
      </Link>
    </>
  );
}
