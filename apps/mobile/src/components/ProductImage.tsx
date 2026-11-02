import { Image } from "expo-image";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { photoUrl } from "@/lib/supabase";
import { colors } from "@/lib/theme";

/** Product photo, or a gold placeholder until the shop adds one. */
export function ProductImage({ path, label, style }: { path?: string | null; label?: string | null; style?: StyleProp<ViewStyle> }) {
  const url = photoUrl(path);
  if (url) {
    return <Image source={{ uri: url }} style={[{ width: "100%", height: "100%" }, style as object]} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[{ width: "100%", height: "100%", backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", gap: 4 }, style]}>
      <Text style={{ fontSize: 28, color: colors.gold }}>❖</Text>
      {label ? <Text style={{ fontSize: 11, letterSpacing: 2, color: colors.gold, textTransform: "uppercase" }}>{label}</Text> : null}
    </View>
  );
}
