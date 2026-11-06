import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

const QA: [string, string][] = [
  ["Is this real gold?", "No. One gram gold jewellery has a thin layer of gold plating over a base metal (usually copper or brass alloy). It looks like gold at a fraction of the price."],
  ["How do I buy?", "Add designs to your bag and tap Buy now to pay online (UPI, cards, netbanking), by UPI or cash on delivery, whichever are offered. Or send the bag as an enquiry and we confirm with you on call or WhatsApp."],
  ["Do I need an account?", "No. You can send an enquiry as a guest. Logging in only saves your details and shows your past enquiries."],
  ["Is the stock on the website up to date?", "Yes. Stock is published from our store's billing system, so 'In stock' means the piece is with us. Very rarely a piece sells in the store just before your enquiry; we'll tell you straight away."],
  ["Do you deliver?", "Yes, across India. Delivery charges are shown at checkout before you pay."],
  ["Can I return or exchange?", "See our returns & exchange page. Damaged-in-transit pieces are always replaced."],
];

export default function Faq() {
  return (
    <>
      <h1>Frequently asked questions</h1>
      {QA.map(([q, a]) => (
        <section key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </section>
      ))}
    </>
  );
}
