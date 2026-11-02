import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { Button, GoldRule } from "@/components/ui";
import { CARD_COLUMNS, getCategories, getSettings, type CardItem } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import { colors, ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Home() {
  const [q, setQ] = useState("");
  const home = useLoad(async () => {
    const [settings, categories, featured, latest] = await Promise.all([
      getSettings(),
      getCategories(),
      supabase.from("catalog").select(CARD_COLUMNS).eq("is_featured", true).order("added_at", { ascending: false }).limit(6),
      supabase.from("catalog").select(CARD_COLUMNS).eq("in_stock", true).order("added_at", { ascending: false }).limit(6),
    ]);
    return { settings, categories, featured: (featured.data ?? []) as CardItem[], latest: (latest.data ?? []) as CardItem[] };
  });
  const d = home.data;
  const showPrice = d?.settings?.show_prices ?? true;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={home.loading} onRefresh={home.reload} />}>
      {d?.settings?.announcement ? <Text style={s.announce}>{d.settings.announcement}</Text> : null}
      <TextInput
        style={ui.input}
        placeholder="Search jhumkas, chokers, design no…"
        value={q}
        onChangeText={setQ}
        returnKeyType="search"
        onSubmitEditing={() => q.trim() && router.push({ pathname: "/shop", params: { q: q.trim() } })}
        accessibilityLabel="Search"
      />
      <View style={s.hero}>
        <Text style={s.heroKicker}>1 GRAM GOLD JEWELLERY</Text>
        <Text style={s.heroTitle}>{d?.settings?.tagline || "Timeless Beauty, Precious You"}</Text>
        <Text style={s.heroText}>The look of real gold for weddings, festivals and every day.</Text>
        <Button title="Shop all designs" variant="gold" onPress={() => router.push("/shop")} />
      </View>
      {home.error && <Text style={ui.error}>{home.error}</Text>}

      {!!d?.categories.length && (
        <View style={{ gap: 10 }}>
          <View><Text style={ui.h2}>Shop by category</Text><GoldRule /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {d.categories.map((c) => (
              <Pressable key={c.id} style={{ width: 76, alignItems: "center", gap: 6 }} onPress={() => router.push({ pathname: "/shop", params: { category: c.slug ?? "" } })}>
                <View style={s.catCircle}><ProductImage path={c.image_path ?? c.cover_path} /></View>
                <Text style={{ fontSize: 12, textAlign: "center", color: colors.ink }} numberOfLines={2}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <Section title="Bestsellers" items={d?.featured ?? []} showPrice={showPrice} />
      <Section title="New arrivals" items={d?.latest ?? []} showPrice={showPrice} />
    </ScrollView>
  );
}

function Section({ title, items, showPrice }: { title: string; items: CardItem[]; showPrice: boolean }) {
  if (!items.length) return null;
  const rows: CardItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 10 }}>
      <View style={ui.between}>
        <View><Text style={ui.h2}>{title}</Text><GoldRule /></View>
        <Pressable onPress={() => router.push("/shop")}><Text style={{ color: colors.gold, fontWeight: "600" }}>View all</Text></Pressable>
      </View>
      {rows.map((r) => (
        <View key={r[0]!.id} style={{ flexDirection: "row", gap: 12 }}>
          {r.map((p) => <ProductCard key={p.id} p={p} showPrice={showPrice} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  announce: { backgroundColor: colors.maroon, color: colors.goldLight, textAlign: "center", padding: 8, borderRadius: 8, fontSize: 12 },
  hero: { backgroundColor: colors.maroonDark, borderRadius: 16, padding: 22, gap: 10, alignItems: "center" },
  heroKicker: { color: colors.goldLight, fontSize: 11, letterSpacing: 3 },
  heroTitle: { color: "#fff", fontSize: 28, fontFamily: "serif", textAlign: "center", fontWeight: "600" },
  heroText: { color: "#F4EAD7cc", textAlign: "center", fontSize: 14 },
  catCircle: { width: 72, height: 72, borderRadius: 36, overflow: "hidden", borderWidth: 2, borderColor: colors.goldLight },
});
