import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";

export const metadata: Metadata = { title: "About us" };

export default async function About() {
  const s = await getSettings();
  return (
    <>
      <h1>About {s?.store_name ?? "Abharanam Collections"}</h1>
      <p className="font-display text-xl italic text-gold">{s?.tagline}</p>
      <p>
        We bring you one gram gold jewellery that looks like real gold, at a price that lets you match a new set to every saree,
        festival and function. Every piece in our catalog is in our own stock: what you see here is what we have.
      </p>
      <p>
        From daily-wear chains and studs to chokers, long harams, bangles and full bridal sets, new designs are added every week.
        Pick your favourites, send us one enquiry, and we&apos;ll confirm availability and delivery on call or WhatsApp.
      </p>
      {s?.address && <p><strong>Visit us:</strong> {s.address}</p>}
    </>
  );
}
