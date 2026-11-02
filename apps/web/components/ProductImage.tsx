import { photoUrl } from "@/lib/storage";

/** Product photo, or an elegant gold placeholder when the shop hasn't added a photo yet. */
export function ProductImage({
  path,
  alt,
  label,
  className = "",
  eager = false,
}: {
  path?: string | null;
  alt: string;
  label?: string | null;
  className?: string;
  eager?: boolean;
}) {
  const url = photoUrl(path);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${alt} (photo coming soon)`}
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-cream via-ivory to-gold-light/50 ${className}`}
    >
      <svg viewBox="0 0 64 64" className="h-1/3 w-1/3 text-gold" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M8 18c6 14 16 22 24 22s18-8 24-22" />
        <path d="M14 22c4 9 11 14 18 14s14-5 18-14" opacity=".6" />
        <circle cx="32" cy="46" r="6" />
        <circle cx="32" cy="46" r="2.5" fill="currentColor" />
        <path d="M32 40v-4M20 33l-2 4M44 33l2 4" />
      </svg>
      {label && <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold">{label}</span>}
    </div>
  );
}
