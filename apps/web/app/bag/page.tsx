import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { BagView } from "./BagView";

export const metadata: Metadata = { title: "Enquiry bag", robots: { index: false } };

export default async function BagPage() {
  const [settings, session] = await Promise.all([getSettings(), getSessionProfile()]);
  let profile = null;
  if (session) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("full_name, phone, city").eq("id", session.user.id).maybeSingle();
    profile = { name: data?.full_name ?? "", phone: data?.phone ?? "", email: session.user.email ?? "", city: data?.city ?? "" };
  }
  return (
    <div>
      <h1 className="text-4xl font-semibold text-maroon">Your enquiry bag</h1>
      <div className="gold-rule mb-6 mt-1 w-24" />
      <BagView
        whatsapp={settings?.whatsapp_number ?? ""}
        open={settings?.enquiries_open ?? true}
        showPrices={settings?.show_prices ?? true}
        profile={profile}
      />
    </div>
  );
}
