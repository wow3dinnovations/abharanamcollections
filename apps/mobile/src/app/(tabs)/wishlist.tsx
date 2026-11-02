import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { Button, Empty } from "@/components/ui";
import { CARD_COLUMNS, type CardItem } from "@/lib/catalog";
import { useWishlist } from "@/lib/local";
import { supabase } from "@/lib/supabase";
import { ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Wishlist() {
  const ids = useWishlist();
  const list = useLoad(async () => {
    if (!ids.length) return [];
    const { data } = await supabase.from("catalog").select(CARD_COLUMNS).in("id", ids);
    return (data ?? []) as CardItem[];
  }, [ids.join(",")]);
  const items = ids.map((id) => list.data?.find((p) => p.id === id)).filter((p): p is CardItem => !!p);

  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={ui.content}
      columnWrapperStyle={{ gap: 12 }}
      numColumns={2}
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} />}
      ListEmptyComponent={
        list.loading ? null : (
          <Empty title="No favourites yet" hint="Tap the heart on any design to save it here.">
            <View style={{ width: 200 }}><Button title="Browse designs" onPress={() => router.push("/shop")} /></View>
          </Empty>
        )
      }
    />
  );
}
