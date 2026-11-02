import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-5xl font-semibold text-maroon">Not found</p>
      <p className="mt-2 text-muted">This page or design is no longer available.</p>
      <Link href="/shop" className="mt-6 inline-block rounded-full bg-maroon px-5 py-2 text-sm text-white">See all designs</Link>
    </div>
  );
}
