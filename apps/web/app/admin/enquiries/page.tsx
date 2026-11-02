import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, PageHeader, Table, Td } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";

const TABS = [
  ["", "Open"],
  ["new", "New"],
  ["contacted", "Contacted"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All"],
] as const;

const tone = (s: string) => (s === "new" ? "warn" : s === "cancelled" ? "bad" : s === "completed" || s === "confirmed" ? "good" : "neutral");

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "", q = "" } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("enquiries")
    .select("id, number, name, phone, city, status, total, item_count, source, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "") query = query.in("status", ["new", "contacted", "confirmed"]);
  else if (status !== "all") query = query.eq("status", status as "new");
  const term = q.replace(/[^a-zA-Z0-9 +-]/g, "").trim();
  if (term) query = query.or(`number.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;

  return (
    <div>
      <PageHeader title="Enquiries">
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Name, phone or ENQ no." className="rounded border border-cream px-2 py-1.5 text-sm" />
        </form>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/admin/enquiries${key ? `?status=${key}` : ""}`} className={`rounded-full px-3 py-1 text-xs ${status === key ? "bg-maroon text-white" : "bg-cream"}`}>
            {label}
          </Link>
        ))}
      </div>
      <Table head={["No.", "When", "Customer", "Pieces", "Total", "Status"]}>
        {(data ?? []).map((e) => (
          <tr key={e.id}>
            <Td><Link href={`/admin/enquiries/${e.id}`} className="font-medium text-maroon underline">{e.number}</Link></Td>
            <Td>{new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" })}</Td>
            <Td>{e.name}<br /><span className="text-xs text-muted">{e.phone}{e.city ? ` · ${e.city}` : ""}</span></Td>
            <Td>{e.item_count}</Td>
            <Td>{rupees(e.total)}</Td>
            <Td><Badge tone={tone(e.status)}>{e.status}</Badge> <span className="text-xs text-muted">{e.source}</span></Td>
          </tr>
        ))}
      </Table>
      {!data?.length && <p className="mt-6 text-sm text-muted">No enquiries here.</p>}
    </div>
  );
}
