import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/admin/ui";
import { razorpayKeys } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";
import { saveOrderSettings, saveSettings } from "./actions";

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: s } = await supabase.from("store_settings").select("*").eq("id", 1).single();
  if (!s) return null;
  const text: [keyof typeof s, string, string?][] = [
    ["store_name", "Store name"],
    ["tagline", "Tagline"],
    ["whatsapp_number", "WhatsApp number (with country code)", "919876543210"],
    ["phone", "Phone (shown on contact page)"],
    ["email", "Email"],
    ["instagram_url", "Instagram link", "https://instagram.com/…"],
    ["announcement", "Announcement bar (leave empty to hide)", "Free shipping above ₹1,999"],
  ];
  return (
    <div>
      <PageHeader title="Website settings" />
      <Card>
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          {text.map(([key, label, ph]) => (
            <Field key={key} label={label}>
              <Input name={key} defaultValue={String(s[key] ?? "")} placeholder={ph} />
            </Field>
          ))}
          <Field label="Store address">
            <Textarea name="address" rows={2} defaultValue={s.address} />
          </Field>
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="show_prices" defaultChecked={s.show_prices} /> Show prices</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="show_stock_count" defaultChecked={s.show_stock_count} /> Show &quot;only N left&quot; when stock is 5 or less</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="enquiries_open" defaultChecked={s.enquiries_open} /> Accept enquiries</label>
          </div>
          {saved && <p className="text-sm text-green-800">Saved.</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div><Button>Save settings</Button></div>
        </form>
      </Card>
      <Card title="Online orders and payment" className="mt-6">
        <form action={saveOrderSettings} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="orders_open" defaultChecked={s.orders_open} /> Take online orders (the &quot;Buy now&quot; button)</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="razorpay_enabled" defaultChecked={s.razorpay_enabled} /> Pay online with Razorpay (UPI apps, cards, netbanking)
              {!razorpayKeys() && <span className="text-xs text-amber-700">· Razorpay keys are not set on the server yet, so this stays hidden</span>}
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" name="upi_manual_enabled" defaultChecked={s.upi_manual_enabled} /> UPI to our account (you mark the order paid)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="cod_enabled" defaultChecked={s.cod_enabled} /> Cash on delivery</label>
          </div>
          <Field label="Your UPI ID (for UPI to our account)"><Input name="upi_id" defaultValue={s.upi_id} placeholder="abharanam@okhdfcbank" /></Field>
          <div />
          <Field label="Delivery charge (₹)"><Input name="shipping_fee" type="number" min="0" defaultValue={Number(s.shipping_fee)} /></Field>
          <Field label="Free delivery on orders from (₹, 0 = never free)"><Input name="free_shipping_above" type="number" min="0" defaultValue={Number(s.free_shipping_above)} /></Field>
          <div><Button>Save order settings</Button></div>
        </form>
      </Card>
    </div>
  );
}
