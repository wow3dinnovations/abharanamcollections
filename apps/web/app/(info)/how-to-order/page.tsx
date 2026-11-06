import type { Metadata } from "next";

export const metadata: Metadata = { title: "How to order" };

export default function HowToOrder() {
  return (
    <>
      <h1>How to order</h1>
      <ol className="ml-5 list-decimal space-y-2">
        <li>Browse the catalog and tap <strong>Add to bag</strong> on each design you like. Use the heart to save favourites for later.</li>
        <li>Open your <a href="/bag">bag</a> and tap <strong>Buy now</strong>. Log in with your email (we send a 6-digit code), add your delivery address and choose how to pay: online (UPI apps, cards, netbanking through Razorpay), UPI to our account, or cash on delivery, whichever are offered.</li>
        <li>Prefer to talk first? Send the bag as an <strong>enquiry</strong> instead, and we call or WhatsApp you to confirm the pieces, delivery and payment.</li>
        <li>We pack your jewellery carefully and ship it. Follow your order in <a href="/orders">My orders</a>.</li>
      </ol>
      <p>Prefer to talk first? Use the <strong>Ask on WhatsApp</strong> button on any design and the design number is sent for you.</p>
    </>
  );
}
