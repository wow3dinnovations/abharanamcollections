import { StyleSheet } from "react-native";

// Same palette as the website: ivory, maroon and gold.
export const colors = {
  ink: "#2A1A12",
  muted: "#7A6A5C",
  line: "#EFE3CC",
  bg: "#FBF7EF",
  card: "#FFFFFF",
  cream: "#F4EAD7",
  maroon: "#6B1D2A",
  maroonDark: "#4E1420",
  gold: "#B8892B",
  goldLight: "#E9D29A",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  ok: "#166534",
  okBg: "#F0FDF4",
  whatsapp: "#15803D",
};

export const serif = "serif";

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  h1: { fontSize: 28, fontWeight: "600", color: colors.maroon, fontFamily: serif },
  h2: { fontSize: 20, fontWeight: "600", color: colors.maroon, fontFamily: serif },
  text: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  price: { fontSize: 15, fontWeight: "700", color: colors.maroon },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  error: { backgroundColor: colors.dangerBg, color: colors.danger, padding: 10, borderRadius: 8, fontSize: 14 },
});
