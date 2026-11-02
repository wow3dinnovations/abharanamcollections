import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { colors, ui } from "@/lib/theme";

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  ...rest
}: PressableProps & { title: string; variant?: "primary" | "outline" | "gold" | "whatsapp"; loading?: boolean }) {
  const off = disabled || loading;
  const dark = variant !== "outline";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      style={({ pressed }) => [s.btn, s[variant], (pressed || off) && { opacity: 0.6 }]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={dark ? "#fff" : colors.maroon} />
      ) : (
        <Text style={[s.btnText, !dark && { color: colors.maroon }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, active && s.chipOn]}
    >
      <Text style={[s.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={[ui.screen, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator color={colors.maroon} />
    </View>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 10 }}>
      <Text style={ui.h2}>{title}</Text>
      {hint && <Text style={[ui.muted, { textAlign: "center" }]}>{hint}</Text>}
      {children}
    </View>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={[ui.row, s.stepper]}>
      <Pressable onPress={() => onChange(value - 1)} style={s.step} accessibilityLabel="One less">
        <Text style={s.stepText}>−</Text>
      </Pressable>
      <Text style={[ui.text, { minWidth: 24, textAlign: "center" }]}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(50, value + 1))} style={s.step} accessibilityLabel="One more">
        <Text style={s.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function GoldRule() {
  return <View style={{ height: 1, width: 80, backgroundColor: colors.gold, marginTop: 2 }} />;
}

const s = StyleSheet.create({
  btn: { borderRadius: 999, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.maroon },
  gold: { backgroundColor: colors.gold },
  whatsapp: { backgroundColor: colors.whatsapp },
  outline: { borderWidth: 1, borderColor: colors.maroon, backgroundColor: colors.card },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.goldLight, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.maroon, borderColor: colors.maroon },
  chipText: { fontSize: 13, color: colors.ink },
  stepper: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, backgroundColor: colors.card, gap: 0 },
  step: { paddingHorizontal: 12, paddingVertical: 6 },
  stepText: { fontSize: 18, color: colors.ink },
});
