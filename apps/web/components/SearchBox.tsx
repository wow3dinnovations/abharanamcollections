export function SearchBox({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/shop" role="search" className={`flex items-center rounded-full border border-cream bg-white px-3 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search jhumkas, chokers, design no…"
        aria-label="Search products"
        className="w-full bg-transparent px-2 py-2 text-sm outline-none"
      />
    </form>
  );
}
