import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, rupees, type OrderStatus, type PaymentStatus } from "@abh/core";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button, Empty, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Orders() {
  const { session, ready } = useAuth();
  const data = useLoad(async () => {
    if (!session) return [];
    const { data: rows } = await supabase
      .from("orders")
      .select("id, number, status, payment_status, total, created_at, order_items(name, quantity)")
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  }, [session?.user.id]);

  if (!ready || data.loading) return <Loading />;
  if (!session) {
    return <View style={ui.screen}><Empty title="Log in to see your orders"><View style={{ width: 200 }}><Button title="Log in" onPress={() => router.push("/login")} /></View></Empty></View>;
  }
  if (!data.data?.length) return <View style={ui.screen}><Empty title="No orders yet" /></View>;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      {data.data.map((o) => (
        <Pressable key={o.id} style={ui.card} onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })}>
          <View style={ui.between}>
            <Text style={[ui.text, { fontWeight: "600" }]}>{o.number}</Text>
            <Text style={ui.muted}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}{o.status !== "cancelled" ? ` · ${PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}` : ""}</Text>
          </View>
          <Text style={ui.muted}>{new Date(o.created_at).toLocaleDateString("en-IN")} · {rupees(o.total)}</Text>
          <Text style={ui.text} numberOfLines={2}>{o.order_items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
