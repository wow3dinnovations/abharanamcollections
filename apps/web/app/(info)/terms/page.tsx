import type { Metadata } from "next";
import { Updated } from "../Updated";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <Updated />
      <ul>
        <li>All jewellery on this website is one gram gold / imitation jewellery, not solid gold, and is sold as such.</li>
        <li>An enquiry is not an order. An order is confirmed only after we confirm availability and receive payment.</li>
        <li>Prices are in Indian rupees and can change without notice. The price confirmed with you is final.</li>
        <li>Photos are of the actual designs; small colour differences on screens are normal.</li>
      </ul>
    </>
  );
}
