import { rupees, whatsappLink } from "@abh/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Field, PageHeader, Select, Table, Td, Textarea } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import { updateEnquiry } from "../actions";

export default async function EnquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("enquiries")
    .select("*, enquiry_items(id, sku, name, price, quantity, products(slug, stock_qty))")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  const wa = whatsappLink(e.phone, `Hello ${e.name}, thank you for your enquiry ${e.number} at Abharanam Collections.`);

  return (
    <div className="space-y-6">
      <PageHeader title={`Enquiry ${e.number}`}>
        <Link href="/admin/enquiries" className="text-sm underline">← All enquiries</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title="Pieces">
          <Table head={["Design", "Price", "Qty", "Line", "Stock now"]}>
            {e.enquiry_items.map((i) => (
              <tr key={i.id}>
                <Td>
                  {i.products?.slug ? <Link className="underline" href={`/products/${i.products.slug}`}>{i.name}</Link> : i.name}
                  <br /><span className="text-xs text-muted">{i.sku}</span>
                </Td>
                <Td>{rupees(i.price)}</Td>
                <Td>{i.quantity}</Td>
                <Td>{rupees(i.price * i.quantity)}</Td>
                <Td>{i.products ? i.products.stock_qty : "removed"}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-right font-semibold">Total {rupees(e.total)}</p>
          <p className="mt-2 text-xs text-muted">When the customer buys, bill it in the shop software POS (scan the tags) so stock updates everywhere.</p>
        </Card>
        <div className="space-y-6">
          <Card title="Customer">
            <p className="font-medium">{e.name}</p>
            <p className="text-sm"><a className="underline" href={`tel:${e.phone}`}>{e.phone}</a></p>
            {e.email && <p className="text-sm">{e.email}</p>}
            {e.city && <p className="text-sm">{e.city}</p>}
            {e.message && <p className="mt-2 whitespace-pre-line rounded bg-ivory p-2 text-sm">{e.message}</p>}
            <p className="mt-2 text-xs text-muted">
              {new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} via {e.source}
            </p>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded bg-green-700 px-3 py-1.5 text-sm text-white">WhatsApp customer</a>}
          </Card>
          <Card title="Status">
            <form key={`${e.status}-${e.updated_at}`} action={updateEnquiry} className="space-y-3">
              <input type="hidden" name="id" value={e.id} />
              <Field label="Status">
                <Select name="status" defaultValue={e.status}>
                  {["new", "contacted", "confirmed", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Private note">
                <Textarea name="admin_note" rows={3} defaultValue={e.admin_note ?? ""} />
              </Field>
              <Button>Save</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
