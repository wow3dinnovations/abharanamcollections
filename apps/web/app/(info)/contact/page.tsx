import { whatsappLink } from "@abh/core";
import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";

export const metadata: Metadata = { title: "Contact us" };

export default async function Contact() {
  const s = await getSettings();
  const wa = whatsappLink(s?.whatsapp_number ?? "", "Hello! I have a question.");
  return (
    <>
      <h1>Contact us</h1>
      <p>We usually reply within a few hours, 10 am to 8 pm, Monday to Saturday.</p>
      <ul>
        {wa && <li>WhatsApp: <a href={wa} target="_blank" rel="noopener noreferrer">Chat with us</a></li>}
        {s?.phone && <li>Phone: <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></li>}
        {s?.email && <li>Email: <a href={`mailto:${s.email}`}>{s.email}</a></li>}
        {s?.instagram_url && <li>Instagram: <a href={s.instagram_url} target="_blank" rel="noopener noreferrer">Follow us</a></li>}
        {s?.address && <li>Store: {s.address}</li>}
      </ul>
    </>
  );
}
