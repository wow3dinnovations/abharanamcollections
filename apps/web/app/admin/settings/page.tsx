import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";

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
    </div>
  );
}
