import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";

export const metadata: Metadata = { title: "Delete your account" };

export default async function DeleteAccount() {
  const s = await getSettings();
  return (
    <>
      <h1>Delete your account</h1>
      <p>To delete your account and the details saved with it (name, phone, city and login email):</p>
      <ol className="ml-5 list-decimal space-y-1">
        <li>Email {s?.email || "us"} from the address you log in with, or WhatsApp us, with the subject &quot;Delete my account&quot;.</li>
        <li>We delete your account within 7 days and confirm by reply.</li>
      </ol>
      <p>Enquiry records may be kept for up to 1 year for our accounts, without your login.</p>
    </>
  );
}
