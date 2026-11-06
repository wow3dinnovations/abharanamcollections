import { bagTotal, enquiryMessage, normaliseIndianMobile, rupees, whatsappLink, type BagLine } from "@abh/core";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ProductImage } from "@/components/ProductImage";
import { Button, Empty, Stepper } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { bag, useBag } from "@/lib/local";
import { supabase } from "@/lib/supabase";
import { colors, ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Bag() {
  const lines = useBag();
  const { session } = useAuth();
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ number: string; lines: BagLine[] } | null>(null);

  const data = useLoad(async () => {
    const ids = lines.map((l) => l.productId);
    const [settings, live] = await Promise.all([
      getSettings(),
      ids.length
        ? supabase.from("catalog").select("id, name, price, sku, slug, image_paths, in_stock").in("id", ids)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const rows = (live.data ?? []).filter((r) => r.id);
    bag.refresh(rows.map((r) => ({ id: r.id!, name: r.name, price: Number(r.price), sku: r.sku, slug: r.slug })));
    return { settings, live: new Map(rows.map((r) => [r.id!, r])) };
  }, [lines.map((l) => l.productId).join(",")]);

  // Fill in details from the account, once.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("full_name, phone, city").eq("id", userId).maybeSingle().then(({ data: p }) =>
      setForm((f) => ({
        ...f,
        name: f.name || p?.full_name || "",
        phone: f.phone || p?.phone || "",
        city: f.city || p?.city || "",
        email: f.email || session?.user.email || "",
      })),
    );
  }, [userId, session?.user.email]);

  const settings = data.data?.settings;
  const showPrice = settings?.show_prices ?? true;

  async function send() {
    setError(null);
    if (form.name.trim().length < 2) return setError("Please enter your name.");
    const phone = normaliseIndianMobile(form.phone);
    if (!phone) return setError("Please enter a valid 10-digit mobile number.");
    setBusy(true);
    const snapshot = lines;
    const { data: res, error: err } = await supabase.rpc("submit_enquiry", {
      p_name: form.name.trim(),
      p_phone: phone,
      p_email: form.email.trim(),
      p_city: form.city.trim(),
      p_message: form.message.trim(),
      p_items: snapshot.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      p_source: "app",
    });
    setBusy(false);
    if (err) return setError(err.message);
    const row = Array.isArray(res) ? res[0] : res;
    setSent({ number: row?.number ?? "", lines: snapshot });
    bag.clear();
  }

  if (sent) {
    const wa = whatsappLink(settings?.whatsapp_number ?? "", enquiryMessage({ lines: sent.lines, number: sent.number, name: form.name, city: form.city }));
    return (
      <View style={[ui.screen, ui.content]}>
        <Empty title="Thank you!" hint={`Your enquiry ${sent.number} has been sent. We'll call or WhatsApp you soon to confirm availability, delivery and payment.`}>
          {wa && <View style={{ width: 260 }}><Button title="Also send on WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(wa)} /></View>}
          <View style={{ width: 260 }}><Button title="Continue browsing" variant="outline" onPress={() => { setSent(null); router.push("/shop"); }} /></View>
        </Empty>
      </View>
    );
  }

  if (!lines.length) {
    return (
      <View style={ui.screen}>
        <Empty title="Your bag is empty" hint="Add the designs you like, then order or send us one enquiry for all of them.">
          <View style={{ width: 200 }}><Button title="Start browsing" onPress={() => router.push("/shop")} /></View>
        </Empty>
      </View>
    );
  }

  const { count, total } = bagTotal(lines);
  const field = (key: keyof typeof form, label: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={ui.muted}>{label}</Text>
      <TextInput style={ui.input} value={form[key]} onChangeText={(v) => setForm({ ...form, [key]: v })} accessibilityLabel={label} maxLength={key === "message" ? 1000 : 80} {...extra} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {lines.map((l) => {
          const p = data.data?.live.get(l.productId);
          return (
            <View key={l.productId} style={[ui.card, { flexDirection: "row", gap: 12 }]}>
              <Pressable style={{ width: 72, height: 72, borderRadius: 8, overflow: "hidden" }} onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: l.slug ?? p?.slug ?? "" } })}>
                <ProductImage path={p?.image_paths?.[0]} />
              </Pressable>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[ui.text, { fontWeight: "500" }]} numberOfLines={2}>{l.name}</Text>
                <Text style={ui.muted}>Design {l.sku}{p && !p.in_stock ? " · sold out" : ""}</Text>
                <View style={ui.between}>
                  <Stepper value={l.quantity} onChange={(n) => bag.setQty(l.productId, n)} />
                  {showPrice && <Text style={ui.price}>{rupees(l.price * l.quantity)}</Text>}
                </View>
              </View>
            </View>
          );
        })}
        <View style={ui.between}>
          <Text style={ui.text}>{count} {count === 1 ? "piece" : "pieces"}</Text>
          {showPrice && <Text style={[ui.price, { fontSize: 20 }]}>{rupees(total)}</Text>}
        </View>
        {settings?.orders_open && (settings.razorpay_enabled || (settings.upi_manual_enabled && !!settings.upi_id) || settings.cod_enabled) && (
          <View style={[ui.card, { gap: 8 }]}>
            <Button title="Buy now" onPress={() => router.push("/checkout")} />
            <Text style={ui.muted}>Pay online, by UPI or cash on delivery. Delivery charges shown at checkout.</Text>
          </View>
        )}
        <View style={[ui.card, { gap: 12 }]}>
          <Text style={ui.h2}>{settings?.orders_open ? "Or send an enquiry" : "Your details"}</Text>
          <Text style={ui.muted}>We confirm availability, delivery charges and payment on call or WhatsApp. No payment now.</Text>
          {field("name", "Your name", { autoComplete: "name" })}
          {field("phone", "Mobile number", { keyboardType: "phone-pad", autoComplete: "tel", placeholder: "98765 43210" })}
          {field("email", "Email (optional)", { keyboardType: "email-address", autoCapitalize: "none" })}
          {field("city", "City / town")}
          {field("message", "Message (optional)", { multiline: true, numberOfLines: 3, placeholder: "Occasion, delivery date, size…", style: [ui.input, { minHeight: 70, textAlignVertical: "top" }] })}
          {error && <Text style={ui.error}>{error}</Text>}
          <Button
            title={settings?.enquiries_open === false ? "Enquiries are paused – please WhatsApp us" : "Send enquiry"}
            loading={busy}
            disabled={settings?.enquiries_open === false}
            onPress={send}
          />
          <Text style={[ui.muted, { color: colors.muted }]}>Prices are checked again when you send.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
