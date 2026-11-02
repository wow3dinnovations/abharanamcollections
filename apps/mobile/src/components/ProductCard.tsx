import { discountPercent, rupees } from "@abh/core";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CardItem } from "@/lib/catalog";
import { useWishlist, wishlist } from "@/lib/local";
import { colors, ui } from "@/lib/theme";
import { ProductImage } from "./ProductImage";

export function ProductCard({ p, showPrice = true }: { p: CardItem; showPrice?: boolean }) {
  const wish = useWishlist();
  const on = wish.includes(p.id);
  const off = discountPercent(Number(p.price), p.mrp == null ? null : Number(p.mrp));
  return (
    <Pressable
      style={s.card}
      onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: p.slug } })}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${rupees(p.price)}`}
    >
      <View style={{ aspectRatio: 1 }}>
        <ProductImage path={p.image_paths?.[0]} label={p.category_name} />
        <Pressable onPress={() => wishlist.toggle(p.id)} style={s.heart} hitSlop={8} accessibilityLabel={on ? "Remove from wishlist" : "Add to wishlist"}>
          <Text style={{ fontSize: 16, color: on ? colors.maroon : colors.ink }}>{on ? "♥" : "♡"}</Text>
        </Pressable>
        {!p.in_stock && <Text style={[s.badge, { backgroundColor: "#2A1A12cc" }]}>Sold out</Text>}
        {p.in_stock && p.is_featured && <Text style={[s.badge, { backgroundColor: colors.gold }]}>Bestseller</Text>}
      </View>
      <View style={{ padding: 10, gap: 2 }}>
        <Text numberOfLines={2} style={[ui.text, { fontSize: 14, fontWeight: "500" }]}>{p.name}</Text>
        <Text style={[ui.muted, { fontSize: 11 }]}>Design {p.sku}</Text>
        {showPrice ? (
          <View style={[ui.row, { gap: 6, flexWrap: "wrap" }]}>
            <Text style={ui.price}>{rupees(p.price)}</Text>
            {off && <Text style={{ fontSize: 12, color: colors.muted, textDecorationLine: "line-through" }}>{rupees(p.mrp)}</Text>}
            {off && <Text style={{ fontSize: 11, color: colors.ok, fontWeight: "600" }}>{off}% off</Text>}
          </View>
        ) : (
          <Text style={{ color: colors.maroon }}>Ask for price</Text>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  heart: { position: "absolute", top: 6, right: 6, backgroundColor: "#ffffffe6", borderRadius: 999, width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 6, left: 6, color: "#fff", fontSize: 11, fontWeight: "600", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
});
