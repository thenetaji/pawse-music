import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useAccent } from "../features/now-playing/now-palette";
import { haptic } from "../lib/haptics";
import { setSetting, useSetting } from "../lib/settings";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import { ChevronRight } from "./glyphs";
import { RIPPLE } from "./ui";

const CHEV = "rgba(255,255,255,0.35)";

// Grouped settings rows shared by Settings and Downloads.
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export const Foot = ({ children }: { children: ReactNode }) => (
  <Text style={styles.foot}>{children}</Text>
);

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function Toggle({
  k,
  label,
  def,
  onChange,
}: {
  k: string;
  label: string;
  def: boolean;
  onChange?: (v: boolean) => void;
}) {
  const value = useSetting(k, def);
  const accent = useAccent();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.tick();
          setSetting(k, v);
          onChange?.(v);
        }}
        trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function Pick<T extends string | number>({
  k,
  label,
  def,
  options,
}: {
  k: string;
  label: string;
  def: T;
  options: [T, string][];
}) {
  const value = useSetting<T>(k, def);
  const shown = options.find(([v]) => v === value)?.[1] ?? "";
  return (
    <Pressable
      onPress={() =>
        showSheet({
          actions: options.map(([v, l]) => ({
            label: v === value ? `✓  ${l}` : l,
            onPress: () => setSetting(k, v),
          })),
        })
      }
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.row,
        pressed && !RIPPLE && styles.pressed,
      ]}
    >
      <Text style={[styles.label, styles.pickLabel]}>{label}</Text>
      <Text style={[styles.value, styles.pickValue]} numberOfLines={1}>
        {shown}
      </Text>
      <ChevronRight size={16} color={CHEV} />
    </Pressable>
  );
}

export function Link({
  label,
  onPress,
  danger,
  tint,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.row,
        pressed && !RIPPLE && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          danger && { color: "#FF5A6A" },
          tint ? { color: tint } : null,
        ]}
      >
        {label}
      </Text>
      {!danger && !tint ? <ChevronRight size={16} color={CHEV} /> : null}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  section: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    ...display("700"),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 32,
    marginTop: 28,
    marginBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  label: { color: "#fff", fontSize: 16 },
  value: { color: "rgba(255,255,255,0.5)", fontSize: 16 },
  // The label keeps its line; a long value shortens with … instead.
  pickLabel: { flexShrink: 0, marginRight: 12 },
  pickValue: { flex: 1, flexShrink: 1, textAlign: "right" },
  foot: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    paddingHorizontal: 32,
    marginTop: 8,
    lineHeight: 18,
  },
});
