import { discountPercent, rupees, whatsappLink } from "@abh/core";
import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { Button, Empty, Loading, Stepper } from "@/components/ui";
import { CARD_COLUMNS, getSettings, type CardItem } from "@/lib/catalog";
import { bag, useBag, useWishlist, wishlist } from "@/lib/local";
import { SITE_URL, supabase } from "@/lib/supabase";
import { colors, ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Product() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const lines = useBag();
  const wish = useWishlist();

  const data = useLoad(async () => {
    const [{ data: p, error }, settings] = await Promise.all([
      supabase.from("catalog").select("*").eq("slug", slug).maybeSingle(),
      getSettings(),
    ]);
    if (error) throw error;
    let related: CardItem[] = [];
    if (p?.category_id) {
      const r = await supabase.from("catalog").select(CARD_COLUMNS).eq("category_id", p.category_id).neq("id", p.id!).order("in_stock", { ascending: false }).order("added_at", { ascending: false }).limit(4);
      related = (r.data ?? []) as CardItem[];
    }
    return { p, settings, related };
  }, [slug]);

  if (data.loading && !data.data) return <Loading />;
  const p = data.data?.p;
  if (!p || !p.id) return <Empty title="This design is no longer available" />;
  const s = data.data!.settings;
  const showPrice = s?.show_prices ?? true;
  const off = discountPercent(Number(p.price), p.mrp == null ? null : Number(p.mrp));
  const url = `${SITE_URL}/products/${p.slug}`;
  const wa = whatsappLink(s?.whatsapp_number ?? "", `Hello! I'm interested in ${p.name} (${p.sku}).\n${url}`);
  const inBag = lines.find((l) => l.productId === p.id)?.quantity ?? 0;
  const liked = wish.includes(p.id);
  const photos: (string | null)[] = p.image_paths?.length ? p.image_paths : [null];
  const specs: [string, string | null][] = [
    ["Design no.", p.sku],
    ["Category", [p.category_name, p.subcategory_name].filter(Boolean).join(" · ")],
    ["Collection", p.collection],
    ["Material", p.material ? `${p.material} (1 gram gold finish)` : "1 gram gold finish"],
    ["Colour / stones", p.colour],
    ["Size", p.size],
  ];

  return (
    <ScrollView style={ui.screen}>
      <Stack.Screen options={{ title: p.category_name ?? "" }} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((path, i) => (
          <View key={path ?? i} style={{ width, height: width }}>
            <ProductImage path={path} label={p.category_name} />
          </View>
        ))}
      </ScrollView>
      {photos.length > 1 && (
        <View style={[ui.row, { justifyContent: "center", paddingTop: 8 }]}>
          {photos.map((_, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === photo ? colors.gold : colors.line }} />)}
        </View>
      )}
      <View style={ui.content}>
        <View style={{ gap: 4 }}>
          <Text style={[ui.h1, { color: colors.ink }]}>{p.name}</Text>
          <Text style={ui.muted}>Design no. {p.sku}</Text>
        </View>
        {showPrice ? (
          <View style={[ui.row, { flexWrap: "wrap" }]}>
            <Text style={[ui.price, { fontSize: 24 }]}>{rupees(p.price)}</Text>
            {off && <Text style={{ color: colors.muted, textDecorationLine: "line-through" }}>{rupees(p.mrp)}</Text>}
            {off && <Text style={{ color: colors.ok, fontWeight: "600" }}>{off}% off</Text>}
          </View>
        ) : <Text style={{ color: colors.maroon, fontSize: 18 }}>Price on request</Text>}
        <Text style={{ color: p.in_stock ? colors.ok : colors.danger, fontWeight: "500" }}>
          {p.in_stock ? (s?.show_stock_count && p.stock_qty <= 5 ? `In stock: only ${p.stock_qty} left` : "In stock") : "Sold out: send an enquiry and we'll tell you when it's back"}
        </Text>

        <View style={[ui.row, { gap: 12 }]}>
          <Stepper value={qty} onChange={(n) => setQty(Math.max(1, n))} />
          <View style={{ flex: 1 }}>
            <Button title={p.in_stock ? "Add to enquiry bag" : "Request this design"}
              onPress={() => bag.add({ productId: p.id!, sku: p.sku, name: p.name, price: Number(p.price), quantity: qty, slug: p.slug })} />
          </View>
        </View>
        {inBag > 0 && (
          <Pressable onPress={() => router.push("/bag")}><Text style={{ color: colors.ok }}>{inBag} in your bag · View bag & send enquiry ›</Text></Pressable>
        )}
        <View style={[ui.row, { gap: 10 }]}>
          <View style={{ flex: 1 }}><Button title={liked ? "♥ Saved" : "♡ Wishlist"} variant="outline" onPress={() => wishlist.toggle(p.id!)} /></View>
          <View style={{ flex: 1 }}><Button title="Share" variant="outline" onPress={() => Share.share({ message: `${p.name} (${p.sku}) ${url}` })} /></View>
        </View>
        {wa && <Button title="Ask on WhatsApp" variant="whatsapp" onPress={() => Linking.openURL(wa)} />}
        {p.description ? <Text style={[ui.text, { lineHeight: 22 }]}>{p.description}</Text> : null}
        <View style={ui.card}>
          {specs.filter(([, v]) => v).map(([k, v]) => (
            <View key={k} style={ui.between}><Text style={ui.muted}>{k}</Text><Text style={[ui.text, { flexShrink: 1, textAlign: "right" }]}>{v}</Text></View>
          ))}
        </View>
        <Text style={ui.muted}>One gram gold / imitation jewellery. Not solid gold.</Text>
        {!!data.data?.related.length && (
          <View style={{ gap: 10 }}>
            <Text style={ui.h2}>You may also like</Text>
            {[0, 2].map((i) => {
              const row = data.data!.related.slice(i, i + 2);
              if (!row.length) return null;
              return (
                <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                  {row.map((r) => <ProductCard key={r.id} p={r} showPrice={showPrice} />)}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
