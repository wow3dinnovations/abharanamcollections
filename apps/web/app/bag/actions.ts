"use server";

import { MAX_LINES, MAX_QTY, normaliseIndianMobile } from "@abh/core";
import { createClient } from "@/lib/supabase/server";

export type EnquiryState =
  | { ok: false; error?: string; values?: Record<string, string> }
  | { ok: true; number: string };

export async function submitEnquiry(_prev: EnquiryState, form: FormData): Promise<EnquiryState> {
  const values = {
    name: String(form.get("name") ?? "").trim(),
    phone: String(form.get("phone") ?? "").trim(),
    email: String(form.get("email") ?? "").trim(),
    city: String(form.get("city") ?? "").trim(),
    message: String(form.get("message") ?? "").trim(),
  };
  const fail = (error: string): EnquiryState => ({ ok: false, error, values });

  if (values.name.length < 2) return fail("Please enter your name.");
  const phone = normaliseIndianMobile(values.phone);
  if (!phone) return fail("Please enter a valid 10-digit mobile number.");
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) return fail("Please check your email address.");

  let items: { product_id: string; quantity: number }[];
  try {
    const raw = JSON.parse(String(form.get("items") ?? "[]")) as { productId: string; quantity: number }[];
    items = raw.slice(0, MAX_LINES).map((l) => ({
      product_id: String(l.productId),
      quantity: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(l.quantity) || 1))),
    }));
  } catch {
    return fail("Your bag could not be read. Please refresh the page.");
  }
  if (!items.length) return fail("Your bag is empty.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_enquiry", {
    p_name: values.name.slice(0, 80),
    p_phone: phone,
    p_email: values.email,
    p_city: values.city.slice(0, 80),
    p_message: values.message.slice(0, 1000),
    p_items: items,
    p_source: "web",
  });
  if (error) return fail(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, number: row?.number ?? "" };
}
