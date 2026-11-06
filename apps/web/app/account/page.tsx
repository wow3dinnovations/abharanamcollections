import { rupees } from "@abh/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

const STATUS: Record<string, string> = {
  new: "Received",
  contacted: "We contacted you",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; edit?: string }> }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/account");
  const { saved, error, edit } = await searchParams;
  const supabase = await createClient();
  const [{ data: profile }, { data: enquiries }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, city").eq("id", session.user.id).single(),
    supabase
      .from("enquiries")
      .select("id, number, status, total, item_count, created_at, enquiry_items(name, sku, quantity)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  // Show the form only while editing, or until a name and mobile are saved.
  const editing = !!edit || !!error || !profile?.full_name || !profile?.phone;

  return (
    <div className="grid gap-8 md:grid-cols-[320px_1fr]">
      <section className="h-fit space-y-4 rounded-xl border border-cream bg-white p-5">
        <h1 className="text-3xl font-semibold text-maroon">My account</h1>
        <p className="text-sm text-muted">{session.user.email}</p>
        {editing ? (
        <form action={saveProfile} className="space-y-3">
          {[
            ["full_name", "Name", profile?.full_name],
            ["phone", "Mobile", profile?.phone],
            ["city", "City / town", profile?.city],
          ].map(([name, label, value]) => (
            <label key={name} className="flex flex-col gap-1 text-xs text-muted">
              {label}
              <input name={name ?? ""} defaultValue={value ?? ""} className="rounded border border-cream bg-ivory px-3 py-2 text-sm text-ink" />
            </label>
          ))}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="w-full rounded-full bg-maroon py-2 text-sm font-medium text-white">Save</button>
          {profile?.full_name && profile?.phone && (
            <a href="/account" className="block text-center text-sm text-muted underline">Cancel</a>
          )}
        </form>
        ) : (
          <div className="space-y-1 text-sm">
            {saved && <p className="mb-2 rounded bg-green-50 p-2 text-green-800">Your details are saved.</p>}
            <p className="font-medium">{profile?.full_name}</p>
            <p>{profile?.phone}</p>
            {profile?.city && <p>{profile.city}</p>}
            <a href="/account?edit=1" className="inline-block pt-2 text-maroon underline">Edit details</a>
          </div>
        )}
        <form action={signOut}>
          <button className="text-sm text-muted underline">Log out</button>
        </form>
      </section>
      <section>
        <div className="mb-6 flex items-center justify-between rounded-xl border border-cream bg-white p-4">
          <p className="font-medium">Orders you placed online</p>
          <a href="/orders" className="rounded-full bg-maroon px-4 py-2 text-sm text-white">My orders</a>
        </div>
        <h2 className="mb-4 text-3xl font-semibold text-maroon">My enquiries</h2>
        {enquiries?.length ? (
          <ul className="space-y-3">
            {enquiries.map((e) => (
              <li key={e.id} className="rounded-xl border border-cream bg-white p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{e.number}</p>
                  <span className="rounded-full bg-cream px-2 py-0.5 text-xs">{STATUS[e.status] ?? e.status}</span>
                </div>
                <p className="text-xs text-muted">
                  {new Date(e.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {e.item_count} pieces · {rupees(e.total)}
                </p>
                <p className="mt-2 text-sm">{e.enquiry_items.map((i) => `${i.name} (${i.sku}) ×${i.quantity}`).join(", ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No enquiries yet. Enquiries you send while logged in appear here.</p>
        )}
      </section>
    </div>
  );
}
