import type { Metadata } from "next";
import { Updated } from "../Updated";

export const metadata: Metadata = { title: "Shipping policy" };

export default function Shipping() {
  return (
    <>
      <h1>Shipping policy</h1>
      <Updated />
      <p>We ship across India through trusted courier partners. Delivery charges and the expected delivery date are confirmed with you before payment.</p>
      <ul>
        <li>Orders are packed and handed to the courier within 1–3 working days after payment.</li>
        <li>Delivery usually takes 3–7 working days depending on your location.</li>
        <li>You receive the tracking number on WhatsApp or SMS.</li>
        <li>Store pickup is free: we keep your pieces ready and tell you when to come.</li>
      </ul>
    </>
  );
}
