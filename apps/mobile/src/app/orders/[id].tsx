import { ORDER_STATUS_LABEL, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, rupees, upiLink, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@abh/core";
import * as Linking from "expo-linking";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Button, Empty, Loading } from "@/components/ui";
import { getSettings } from "@/lib/catalog";
import { ORDER_COLUMNS, payUrl } from "@/lib/orders";
import { supabase } from "@/lib/supabase";
import { ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

type Addr = { full_name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string };

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const [tick, setTick] = useState(0);
  // Reload when the customer comes back from the payment page.
  useFocusEffect(useCallback(() => setTick((t) => t + 1), []));
  const data = useLoad(async () => {
    const [o, items, settings] = await Promise.all([
      supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle(),
      supabase.from("order_items").select("id, sku, name, price, quantity, line_total").eq("order_id", id).order("id"),
      getSettings(),
    ]);
    return { o: o.data, items: items.data ?? [], settings };
  }, [id, tick]);
  const [busy, setBusy] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  const o = data.data?.o;
  if (!o) return <View style={ui.screen}><Empty title="Order not found" /></View>;
  const a = o.shipping_address as Addr;
  const method = o.payment_method as PaymentMethod;
  const unpaid = o.payment_status === "pending" && o.status !== "cancelled";
  const upi = data.data?.settings?.upi_id;

  const cancel = () =>
    Alert.alert("Cancel this order?", "The pieces go back on sale.", [
      { text: "Keep order", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc("cancel_my_order", { p_order: o.id });
          setBusy(false);
          if (error) Alert.alert("Could not cancel", error.message);
          setTick((t) => t + 1);
        },
      },
    ]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      {placed && <Text style={[ui.card, ui.text]}>Thank you! Your order {o.number} is placed.</Text>}
      <View style={ui.between}>
        <Text style={ui.h1}>{o.number}</Text>
        <Text style={ui.muted}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Text>
      </View>
      <Text style={ui.text}>{PAYMENT_LABEL[method]} · {o.status === "cancelled" ? "—" : PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</Text>
      {o.tracking ? <Text style={[ui.card, ui.text]}>Tracking: {o.tracking}</Text> : null}
      {unpaid && method === "razorpay" && (
        <View style={[ui.card, { gap: 8 }]}>
          <Text style={ui.text}>Waiting for payment. Please pay within 60 minutes of ordering to keep your pieces.</Text>
          <Button title={`Pay ${rupees(o.total)} now`} onPress={() => Linking.openURL(payUrl(o.id, o.pay_token))} />
        </View>
      )}
      {unpaid && method === "upi_manual" && upi && (
        <View style={[ui.card, { gap: 8 }]}>
          <Text style={ui.text}>Please pay {rupees(o.total)} to our UPI ID {upi} and write {o.number} in the note.</Text>
          <Button title="Open UPI app" onPress={() => Linking.openURL(upiLink(upi, data.data?.settings?.store_name ?? "Abharanam", Number(o.total), o.number))} />
        </View>
      )}
      <View style={ui.card}>
        {data.data?.items.map((i) => (
          <View key={i.id} style={ui.between}>
            <Text style={[ui.text, { flex: 1 }]}>{i.name} ({i.sku}) × {i.quantity}</Text>
            <Text style={ui.text}>{rupees(i.line_total)}</Text>
          </View>
        ))}
        <View style={ui.between}><Text style={ui.muted}>Delivery</Text><Text style={ui.text}>{Number(o.shipping_fee) ? rupees(o.shipping_fee) : "Free"}</Text></View>
        <View style={ui.between}><Text style={ui.h2}>Total</Text><Text style={[ui.price, { fontSize: 20 }]}>{rupees(o.total)}</Text></View>
      </View>
      <View style={ui.card}>
        <Text style={ui.h2}>Delivery to</Text>
        <Text style={ui.text}>{a.full_name} · {a.phone}{"\n"}{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}</Text>
      </View>
      {o.status === "placed" && o.payment_status !== "paid" && <Button title="Cancel order" variant="outline" loading={busy} onPress={cancel} />}
    </ScrollView>
  );
}
