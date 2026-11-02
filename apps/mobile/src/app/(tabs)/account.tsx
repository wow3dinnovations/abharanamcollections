import { normaliseIndianMobile, rupees, whatsappLink } from "@abh/core";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { SITE_URL, supabase } from "@/lib/supabase";
import { colors, ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

const STATUS: Record<string, string> = { new: "Received", contacted: "We contacted you", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

export default function Account() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const data = useLoad(async () => {
    const settings = await getSettings();
    if (!userId) return { settings, profile: null, enquiries: [] };
    const [{ data: profile }, { data: enquiries }] = await Promise.all([
      supabase.from("profiles").select("full_name, phone, city").eq("id", userId).single(),
      supabase.from("enquiries").select("id, number, status, total, item_count, created_at, enquiry_items(name, sku, quantity)").order("created_at", { ascending: false }).limit(30),
    ]);
    return { settings, profile, enquiries: enquiries ?? [] };
  }, [userId]);
  const [form, setForm] = useState({ full_name: "", phone: "", city: "" });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const p = data.data?.profile;
    if (p) setForm({ full_name: p.full_name ?? "", phone: p.phone ?? "", city: p.city ?? "" });
  }, [data.data?.profile]);

  const s = data.data?.settings;
  const wa = whatsappLink(s?.whatsapp_number ?? "", "Hello! I have a question.");

  async function save() {
    if (!userId) return;
    const phone = form.phone.trim() ? normaliseIndianMobile(form.phone) : null;
    if (form.phone.trim() && !phone) return setMsg("Enter a valid 10-digit mobile number");
    const { error } = await supabase.from("profiles").update({ full_name: form.full_name.trim() || null, phone, city: form.city.trim() || null }).eq("id", userId);
    setMsg(error ? error.message : "Saved");
  }

  const link = (label: string, path: string) => (
    <Pressable key={path} onPress={() => Linking.openURL(`${SITE_URL}${path}`)} style={{ paddingVertical: 8 }}>
      <Text style={{ color: colors.maroon }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      {session ? (
        <View style={ui.card}>
          <Text style={ui.h2}>My details</Text>
          <Text style={ui.muted}>{session.user.email}</Text>
          {(["full_name", "phone", "city"] as const).map((k) => (
            <TextInput key={k} style={ui.input} value={form[k]} onChangeText={(v) => setForm({ ...form, [k]: v })}
              placeholder={{ full_name: "Name", phone: "Mobile", city: "City / town" }[k]} accessibilityLabel={k} keyboardType={k === "phone" ? "phone-pad" : "default"} />
          ))}
          {msg && <Text style={ui.muted}>{msg}</Text>}
          <Button title="Save" onPress={save} />
          <Button title="Log out" variant="outline" onPress={() => supabase.auth.signOut()} />
        </View>
      ) : (
        <View style={ui.card}>
          <Text style={ui.h2}>Log in (optional)</Text>
          <Text style={ui.muted}>Logging in fills your details on enquiries and shows your past enquiries.</Text>
          <Button title="Log in with email" onPress={() => router.push("/login")} />
        </View>
      )}

      {session && (
        <View style={{ gap: 10 }}>
          <Text style={ui.h2}>My enquiries</Text>
          {data.data?.enquiries.length ? (
            data.data.enquiries.map((e) => (
              <View key={e.id} style={ui.card}>
                <View style={ui.between}>
                  <Text style={[ui.text, { fontWeight: "600" }]}>{e.number}</Text>
                  <Text style={ui.muted}>{STATUS[e.status] ?? e.status}</Text>
                </View>
                <Text style={ui.muted}>
                  {new Date(e.created_at).toLocaleDateString("en-IN")} · {e.item_count} pieces · {rupees(e.total)}
                </Text>
                <Text style={ui.text}>{e.enquiry_items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</Text>
              </View>
            ))
          ) : (
            <Text style={ui.muted}>No enquiries yet.</Text>
          )}
        </View>
      )}

      <View style={ui.card}>
        <Text style={ui.h2}>Help</Text>
        {wa && <Button title="Chat with us on WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(wa)} />}
        {s?.phone ? <Pressable onPress={() => Linking.openURL(`tel:${s.phone.replace(/\s/g, "")}`)}><Text style={{ color: colors.maroon, paddingVertical: 8 }}>Call {s.phone}</Text></Pressable> : null}
        {link("How to order", "/how-to-order")}
        {link("Jewellery care", "/care")}
        {link("Shipping", "/shipping-policy")}
        {link("Returns & exchange", "/returns")}
        {link("Privacy policy", "/privacy")}
        {link("Delete your account", "/delete-account")}
      </View>
    </ScrollView>
  );
}
