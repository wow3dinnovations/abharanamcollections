import type { Metadata } from "next";

export const metadata: Metadata = { title: "How to order" };

export default function HowToOrder() {
  return (
    <>
      <h1>How to order</h1>
      <ol className="ml-5 list-decimal space-y-2">
        <li>Browse the catalog and tap <strong>Add to enquiry bag</strong> on each design you like. Use the heart to save favourites for later.</li>
        <li>Open your <a href="/bag">enquiry bag</a>, adjust quantities, and send it with your name and mobile number. No payment is taken on the website.</li>
        <li>We call or WhatsApp you to confirm the pieces, delivery charges and payment (UPI, bank transfer or cash at the store).</li>
        <li>We pack your jewellery carefully and ship it, or keep it ready for you to collect.</li>
      </ol>
      <p>Prefer to talk first? Use the <strong>Ask on WhatsApp</strong> button on any design and the design number is sent for you.</p>
    </>
  );
}
