import type { Metadata } from "next";
import { Updated } from "../Updated";

export const metadata: Metadata = { title: "Returns & exchange" };

export default function Returns() {
  return (
    <>
      <h1>Returns & exchange</h1>
      <Updated />
      <ul>
        <li>If a piece arrives damaged or wrong, tell us within 48 hours of delivery with an unboxing video and photos. We replace it free.</li>
        <li>Exchange for another design is possible within 7 days for unused pieces in original packing. Earrings and nose pins cannot be exchanged for hygiene reasons.</li>
        <li>Refunds for cancelled orders go back to the original payment method within 5–7 working days.</li>
      </ul>
      <p>Please confirm the details with our team; these terms are a starting point and can be changed by the shop.</p>
    </>
  );
}
