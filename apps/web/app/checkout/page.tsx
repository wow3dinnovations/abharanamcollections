import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/catalog";
import { razorpayKeys } from "@/lib/razorpay";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/checkout");
  const supabase = await createClient();
  const [settings, addresses, profile] = await Promise.all([
    getSettings(),
    supabase.from("addresses").select("*").order("created_at", { ascending: false }).limit(5),
    supabase.from("profiles").select("full_name, phone, city").eq("id", session.user.id).maybeSingle(),
  ]);
  const methods = [
    settings?.razorpay_enabled && razorpayKeys() ? ("razorpay" as const) : null,
    settings?.upi_manual_enabled && settings.upi_id ? ("upi_manual" as const) : null,
    settings?.cod_enabled ? ("cod" as const) : null,
  ].filter((m) => m !== null);

  return (
    <div>
      <h1 className="text-4xl font-semibold text-maroon">Checkout</h1>
      <div className="gold-rule mb-6 mt-1 w-24" />
      {!settings?.orders_open || !methods.length ? (
        <p className="mx-auto max-w-lg rounded-xl border border-cream bg-white p-6 text-center">
          Online orders are not open yet. Please <a href="/bag" className="text-maroon underline">send an enquiry</a> from your bag, and we&apos;ll
          confirm on call or WhatsApp.
        </p>
      ) : (
        <CheckoutForm
          methods={methods}
          addresses={addresses.data ?? []}
          shippingFee={Number(settings.shipping_fee)}
          freeAbove={Number(settings.free_shipping_above)}
          profile={{ name: profile.data?.full_name ?? "", phone: profile.data?.phone ?? "", city: profile.data?.city ?? "" }}
        />
      )}
    </div>
  );
}
