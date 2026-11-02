import { bagTotal } from "@abh/core";
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useBag, useWishlist } from "@/lib/local";
import { colors } from "@/lib/theme";

// Text glyphs keep the app free of an icon font dependency.
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 19 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { count } = bagTotal(useBag());
  const wish = useWishlist().length;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.maroon,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        headerTintColor: colors.maroon,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: "serif", fontWeight: "700" },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: "Abharanam · 1 Gram Gold", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="shop" options={{ title: "Shop", tabBarIcon: icon("❖") }} />
      <Tabs.Screen name="wishlist" options={{ title: "Wishlist", tabBarIcon: icon("♡"), tabBarBadge: wish || undefined }} />
      <Tabs.Screen name="bag" options={{ title: "Bag", headerTitle: "Enquiry bag", tabBarIcon: icon("◫"), tabBarBadge: count || undefined }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("◉") }} />
    </Tabs>
  );
}
