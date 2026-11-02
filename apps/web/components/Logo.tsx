import Link from "next/link";

export function Logo({ name = "Abharanam" }: { name?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-2xl font-bold tracking-wide text-maroon">{name.replace(/ collections$/i, "")}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-gold">1 Gram Gold</span>
      </span>
    </Link>
  );
}
