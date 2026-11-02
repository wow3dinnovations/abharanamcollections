"use client";
import { useWishlist, wishlist } from "@/lib/local";

export function WishButton({ id, className = "", withLabel = false }: { id: string; className?: string; withLabel?: boolean }) {
  const list = useWishlist();
  const on = list.includes(id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist.toggle(id);
      }}
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${on ? "fill-maroon text-maroon" : "fill-none text-ink"}`} stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
      </svg>
      {withLabel && <span className="text-sm">{on ? "In wishlist" : "Wishlist"}</span>}
    </button>
  );
}
