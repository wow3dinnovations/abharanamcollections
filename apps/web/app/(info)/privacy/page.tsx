import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";
import { Updated } from "../Updated";

export const metadata: Metadata = { title: "Privacy policy" };

export default async function Privacy() {
  const s = await getSettings();
  return (
    <>
      <h1>Privacy policy</h1>
      <Updated />
      <p>{s?.store_name ?? "Abharanam Collections"} collects only what we need to answer your enquiries:</p>
      <ul>
        <li>The name, mobile number, email, city and message you type when you send an enquiry.</li>
        <li>Your email address if you log in.</li>
        <li>Your wishlist and enquiry bag are saved only on your own device.</li>
      </ul>
      <p>We use these details only to contact you about your enquiry and orders. We never sell them. Data is stored securely with Supabase (servers in India / Asia).</p>
      <p>To see, correct or delete your data, write to {s?.email || "us"} or follow the steps on the <a href="/delete-account">delete your account</a> page.</p>
    </>
  );
}
