import { INDIAN_STATES, PAYMENT_LABEL, isPincode, normaliseIndianMobile, rupees, shippingFor, type PaymentMethod } from "@abh/core";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Chip, Empty, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { bag, useBag } from "@/lib/local";
import { payUrl } from "@/lib/orders";
import { supabase } from "@/lib/supabase";
import { colors, ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

type Address = { full_name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string };
const HINT: Record<PaymentMethod, string> = {
  razorpay: "Pay now with any UPI app, card or netbanking (secure Razorpay page).",
  upi_manual: "Pay our UPI ID after placing the order.",
  cod: "Pay in cash when the parcel arrives.",
};

export default function Checkout() {
  const { session, ready } = useAuth();
  const lines = useBag();
  const userId = session?.user.id;
  const data = useLoad(async () => {
    const [settings, addr, live] = await Promise.all([
      getSettings(),
      userId ? supabase.from("addresses").select("*").order("created_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] as never[] }),
      supabase.from("catalog").select("id, price, in_stock, stock_qty").in("id", lines.map((l) => l.productId)),
    ]);
    return { settings, last: addr.data?.[0] ?? null, live: new Map((live.data ?? []).map((r) => [r.id ?? "", r])) };
  }, [userId]);
  const [a, setA] = useState<Address>({ full_name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStates, setShowStates] = useState(false);

  useEffect(() => {
    const l = data.data?.last;
    if (l) setA({ full_name: l.full_name, phone: l.phone, line1: l.line1, line2: l.line2, city: l.city, state: l.state, pincode: l.pincode });
  }, [data.data?.last]);

  const s = data.data?.settings;
  const methods = ([
    s?.razorpay_enabled ? "razorpay" : null,
    s?.upi_manual_enabled && s.upi_id ? "upi_manual" : null,
    s?.cod_enabled ? "cod" : null,
  ].filter(Boolean) as PaymentMethod[]);
  useEffect(() => {
    if (!method && methods[0]) setMethod(methods[0]);
  }, [methods, method]);

  if (!ready || data.loading) return <Loading />;
  if (!session) {
    return (
      <View style={ui.screen}>
        <Empty title="Log in to order" hint="We email you a 6-digit code. No password.">
          <View style={{ width: 220 }}><Button title="Log in" onPress={() => router.push({ pathname: "/login", params: { next: "/checkout" } })} /></View>
        </Empty>
      </View>
    );
  }
  if (!lines.length) return <View style={ui.screen}><Empty title="Your bag is empty" /></View>;
  if (!s?.orders_open || !methods.length) {
    return <View style={ui.screen}><Empty title="Online orders are not open yet" hint="Please send an enquiry from your bag, and we'll confirm on call or WhatsApp." /></View>;
  }

  const priced = lines.map((l) => ({ ...l, price: Number(data.data?.live.get(l.productId)?.price ?? l.price) }));
  const subtotal = priced.reduce((t, l) => t + l.price * l.quantity, 0);
  const shipping = shippingFor(subtotal, Number(s.shipping_fee), Number(s.free_shipping_above));

  async function place() {
    setError(null);
    const phone = normaliseIndianMobile(a.phone);
    if (a.full_name.trim().length < 2) return setError("Please enter the name for delivery.");
    if (!phone) return setError("Please enter a valid 10-digit mobile number.");
    if (a.line1.trim().length < 3 || a.city.trim().length < 2 || !a.state) return setError("Please fill in the address, city and state.");
    if (!isPincode(a.pincode)) return setError("Please enter a valid 6-digit PIN code.");
    if (!method) return;
    setBusy(true);
    const { data: saved, error: addrErr } = await supabase
      .from("addresses")
      .insert({ ...a, full_name: a.full_name.trim(), phone: phone.slice(-10), line1: a.line1.trim(), line2: a.line2.trim(), city: a.city.trim(), pincode: a.pincode.trim() })
      .select("id")
      .single();
    if (addrErr || !saved) {
      setBusy(false);
      return setError(addrErr?.message ?? "Could not save the address.");
    }
    const { data: res, error: err } = await supabase.rpc("place_order", {
      p_items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      p_address_id: saved.id,
      p_method: method,
      p_notes: notes.trim(),
    });
    setBusy(false);
    if (err) return setError(err.message);
    const row = Array.isArray(res) ? res[0] : res;
    if (!row) return setError("Could not place the order. Please try again.");
    bag.clear();
    router.replace({ pathname: "/orders/[id]", params: { id: row.id, placed: "1" } });
    if (method === "razorpay") Linking.openURL(payUrl(row.id, row.pay_token));
  }

  const field = (key: keyof Address, label: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={ui.muted}>{label}</Text>
      <TextInput style={ui.input} value={a[key]} onChangeText={(v) => setA({ ...a, [key]: v })} accessibilityLabel={label} maxLength={key === "pincode" ? 6 : 200} {...extra} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <View style={[ui.card, { gap: 10 }]}>
          <Text style={ui.h2}>Delivery address</Text>
          {field("full_name", "Full name", { autoComplete: "name" })}
          {field("phone", "Mobile number", { keyboardType: "phone-pad", autoComplete: "tel" })}
          {field("line1", "House no., street", { autoComplete: "address-line1" })}
          {field("line2", "Area, landmark (optional)")}
          {field("city", "City / town")}
          <View style={{ gap: 4 }}>
            <Text style={ui.muted}>State</Text>
            <Pressable style={ui.input} onPress={() => setShowStates(!showStates)} accessibilityRole="button">
              <Text style={a.state ? ui.text : ui.muted}>{a.state || "Choose state"}</Text>
            </Pressable>
            {showStates && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {INDIAN_STATES.map((st) => (
                  <Chip key={st} label={st} active={a.state === st} onPress={() => { setA({ ...a, state: st }); setShowStates(false); }} />
                ))}
              </View>
            )}
          </View>
          {field("pincode", "PIN code", { keyboardType: "number-pad", autoComplete: "postal-code" })}
        </View>

        <View style={[ui.card, { gap: 10 }]}>
          <Text style={ui.h2}>Payment</Text>
          {methods.map((m) => (
            <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ checked: method === m }}
              style={{ borderWidth: 1, borderColor: method === m ? colors.maroon : colors.line, borderRadius: 8, padding: 10, gap: 2 }}>
              <Text style={[ui.text, { fontWeight: "600" }]}>{method === m ? "● " : "○ "}{PAYMENT_LABEL[m]}</Text>
              <Text style={ui.muted}>{HINT[m]}</Text>
            </Pressable>
          ))}
          <TextInput style={[ui.input, { minHeight: 60, textAlignVertical: "top" }]} multiline value={notes} onChangeText={setNotes} maxLength={500} placeholder="Note for us (optional)" accessibilityLabel="Note for us" />
        </View>

        <View style={[ui.card, { gap: 6 }]}>
          {priced.map((l) => (
            <View key={l.productId} style={ui.between}>
              <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>{l.name} × {l.quantity}</Text>
              <Text style={ui.text}>{rupees(l.price * l.quantity)}</Text>
            </View>
          ))}
          <View style={ui.between}><Text style={ui.muted}>Delivery</Text><Text style={ui.text}>{shipping ? rupees(shipping) : "Free"}</Text></View>
          <View style={ui.between}><Text style={ui.h2}>Total</Text><Text style={[ui.price, { fontSize: 20 }]}>{rupees(subtotal + shipping)}</Text></View>
        </View>
        {error && <Text style={ui.error}>{error}</Text>}
        <Button title={method === "razorpay" ? `Place order & pay ${rupees(subtotal + shipping)}` : "Place order"} loading={busy} onPress={place} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
