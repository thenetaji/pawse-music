import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useAccent } from "../features/now-playing/now-palette";
import { haptic } from "../lib/haptics";
import { tipOnce } from "../lib/setting-tip";
import { setSetting, useSetting } from "../lib/settings";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import { ChevronRight, InfoGlyph } from "./glyphs";
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

/** A section's explanation, folded behind an ⓘ under the group until tapped. */
export function Foot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide details" : "More about this"}
        onPress={() => {
          haptic.light();
          setOpen((o) => !o);
        }}
        style={styles.footButton}
      >
        <InfoGlyph size={15} color={open ? "#fff" : "rgba(255,255,255,0.45)"} />
      </Pressable>
      {open ? <Text style={styles.foot}>{children}</Text> : null}
    </View>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/**
 * `hint` is a line under the label for an effect you can't see here; `tip` is the toast that
 * says where to look the first time it is turned on. `write` replaces the plain save.
 */
export function Toggle({
  k,
  label,
  def,
  hint,
  tip,
  onChange,
  write,
}: {
  k: string;
  label: string;
  def: boolean;
  hint?: string;
  tip?: string;
  onChange?: (v: boolean) => void;
  write?: (v: boolean) => void;
}) {
  const value = useSetting(k, def);
  const accent = useAccent();
  return (
    <View style={styles.row}>
      {hint ? (
        <View style={styles.labelColumn}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : (
        <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      )}
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.tick();
          if (write) write(v);
          else setSetting(k, v);
          onChange?.(v);
          if (v && tip) tipOnce(k, tip);
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
  hint,
  options,
}: {
  k: string;
  label: string;
  def: T;
  hint?: string;
  options: [T, string][];
}) {
  const saved = useSetting<T>(k, def);
  // A value no longer offered (an option that was removed) reads as the default.
  const value = options.some(([v]) => v === saved) ? saved : def;
  const shown = options.find(([v]) => v === value)?.[1] ?? "";
  return (
    <Pressable
      onPress={() =>
        showSheet({
          title: label,
          actions: options.map(([v, l]) => ({
            label: l,
            checked: v === value,
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
      {hint ? (
        <View style={styles.pickColumn}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : (
        <Text style={[styles.label, styles.pickLabel]}>{label}</Text>
      )}
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
  labelColumn: { flex: 1, paddingVertical: 8, paddingRight: 12 },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  // The label keeps its line; a long value shortens with … instead.
  pickLabel: { flexShrink: 0, marginRight: 12 },
  pickValue: { flex: 1, flexShrink: 1, textAlign: "right" },
  pickColumn: { flex: 2, paddingVertical: 8, paddingRight: 12 },
  foot: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    paddingHorizontal: 32,
    marginTop: 2,
    lineHeight: 18,
  },
  footButton: {
    alignSelf: "flex-end",
    marginRight: 26,
    marginTop: 6,
    padding: 4,
  },
});
