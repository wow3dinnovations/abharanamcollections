import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jewellery care" };

export default function Care() {
  return (
    <>
      <h1>Caring for your 1 gram gold jewellery</h1>
      <ul>
        <li>Put jewellery on last, after perfume, hair spray and lotion, and take it off first.</li>
        <li>Keep it away from water, sweat, soap and sanitiser. Remove before bathing, swimming or exercise.</li>
        <li>Wipe gently with a soft dry cotton cloth after wearing.</li>
        <li>Store each piece separately in an air-tight pouch or box, with a little cotton or silica gel.</li>
        <li>Don&apos;t use jewellery cleaners, polishing cloths for real gold, or brushes: they remove the gold layer.</li>
      </ul>
      <p>With this care, the gold finish stays bright for a long time.</p>
    </>
  );
}
