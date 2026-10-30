import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Foot, Section, styles as rows } from "../components/settings-rows";
import { showToast } from "../components/toast";
import { useAccent } from "../features/now-playing/now-palette";
import { type AutoEqEntry, searchIndex } from "../lib/audio-fx/autoeq";
import { loadIndex, loadProfile } from "../lib/audio-fx/autoeq-source";
import {
  BAND_FREQS,
  clamp,
  DEFAULT_EQ,
  type EqSetting,
  GAIN_LIMIT,
  PREAMP_LIMIT,
  PRESETS,
  presetGains,
} from "../lib/audio-fx/eq";
import { haptic } from "../lib/haptics";
import { setSetting, useSetting } from "../lib/settings";
import { display } from "../lib/type";

const hz = (f: number) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(v % 1 ? 1 : 0)} dB`;

export default function Equaliser() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const eq = useSetting<EqSetting>("eq", DEFAULT_EQ);
  const update = (patch: Partial<EqSetting>) =>
    setSetting("eq", { ...eq, ...patch });
  const gains = presetGains(
    eq.preset === "headphones" ? "flat" : eq.preset,
    eq,
  );

  const nudgeBand = (i: number, step: number) => {
    const next = [...gains];
    next[i] = clamp(
      Math.round((next[i] + step) * 2) / 2,
      -GAIN_LIMIT,
      GAIN_LIMIT,
    );
    update({ preset: "custom", gains: next });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <Text style={styles.title}>Equaliser</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <Section title="Sound">
        <View style={rows.row}>
          <Text style={[rows.label, { flex: 1 }]}>Equaliser</Text>
          <Switch
            value={eq.on}
            onValueChange={(on) => {
              haptic.tick();
              update({ on });
            }}
            trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.pills}>
          {PRESETS.map((p) => (
            <Pill
              key={p.id}
              label={p.name}
              active={eq.preset === p.id}
              accent={accent}
              onPress={() => update({ on: true, preset: p.id })}
            />
          ))}
          <Pill
            label="Custom"
            active={eq.preset === "custom"}
            accent={accent}
            onPress={() => update({ on: true, preset: "custom" })}
          />
          <Pill
            label="Headphones"
            active={eq.preset === "headphones"}
            accent={accent}
            onPress={() => update({ on: true, preset: "headphones" })}
          />
        </View>
      </Section>

      {eq.preset === "headphones" ? (
        <Headphones
          eq={eq}
          accent={accent}
          onPick={(headphone) => update({ headphone, on: true })}
        />
      ) : (
        <Section title="Bands">
          {BAND_FREQS.map((f, i) => (
            <Stepper
              key={f}
              label={hz(f)}
              value={db(gains[i] ?? 0)}
              onMinus={() => nudgeBand(i, -1)}
              onPlus={() => nudgeBand(i, 1)}
            />
          ))}
        </Section>
      )}

      <Section title="Preamp">
        <Stepper
          label="Preamp"
          value={db(eq.preamp)}
          onMinus={() =>
            update({
              preamp: clamp(eq.preamp - 1, -PREAMP_LIMIT, PREAMP_LIMIT),
            })
          }
          onPlus={() =>
            update({
              preamp: clamp(eq.preamp + 1, -PREAMP_LIMIT, PREAMP_LIMIT),
            })
          }
        />
      </Section>
      <Foot>
        Boosts are balanced automatically so loud songs don’t clip. A very long
        mix or a song Pawse plays in pieces may not pass through the equaliser.
      </Foot>
    </ScrollView>
  );
}

function Pill({
  label,
  active,
  accent,
  onPress,
}: {
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      style={[styles.pill, active && { backgroundColor: accent }]}
    >
      <Text style={[styles.pillText, active && { color: "#000" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={rows.row}>
      <Text style={[rows.label, { flex: 1 }]}>{label}</Text>
      <Pressable hitSlop={8} onPress={onMinus} style={styles.step}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={[rows.value, styles.stepValue]}>{value}</Text>
      <Pressable hitSlop={8} onPress={onPlus} style={styles.step}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function Headphones({
  eq,
  accent,
  onPick,
}: {
  eq: EqSetting;
  accent: string;
  onPick: (p: NonNullable<EqSetting["headphone"]>) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<AutoEqEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!query || index || failed) return;
    loadIndex().then(setIndex, () => setFailed(true));
  }, [query, index, failed]);

  const results = useMemo(
    () => (index ? searchIndex(index, query) : []),
    [index, query],
  );

  const choose = (entry: AutoEqEntry) => {
    setBusy(entry.path);
    loadProfile(entry)
      .then(onPick)
      .catch(() =>
        showToast("Couldn't load that correction. Check your connection."),
      )
      .finally(() => setBusy(null));
  };

  return (
    <>
      <Section title="Headphones">
        {eq.headphone ? (
          <View style={rows.row}>
            <Text style={[rows.label, { flex: 1 }]} numberOfLines={1}>
              {eq.headphone.name}
            </Text>
            <Text style={rows.value}>{eq.headphone.source}</Text>
          </View>
        ) : null}
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setFailed(false);
          }}
          placeholder="Search your headphones or earphones"
          placeholderTextColor="rgba(255,255,255,0.3)"
          selectionColor={accent}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />
        {failed ? (
          <Text style={styles.note}>
            Couldn’t load the AutoEq list. Check your connection.
          </Text>
        ) : query && !index ? (
          <ActivityIndicator style={{ margin: 16 }} />
        ) : null}
        {results.map((r) => (
          <Pressable key={r.path} onPress={() => choose(r)} style={rows.row}>
            <View style={{ flex: 1 }}>
              <Text style={rows.label} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.source} numberOfLines={1}>
                {r.source}
              </Text>
            </View>
            {busy === r.path ? <ActivityIndicator /> : null}
          </Pressable>
        ))}
        {index && query && !results.length ? (
          <Text style={styles.note}>No match in AutoEq’s list.</Text>
        ) : null}
      </Section>
      <Foot>
        Corrections are AutoEq’s results, aimed at the Harman target. The list
        and the one you pick are downloaded from GitHub once and kept.
      </Foot>
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  title: { color: "#fff", fontSize: 28, ...display("800") },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  pillText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  step: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stepText: { color: "#fff", fontSize: 20, lineHeight: 22 },
  stepValue: { minWidth: 78, textAlign: "center" },
  search: { color: "#fff", fontSize: 16, paddingHorizontal: 16, minHeight: 52 },
  source: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
  note: { color: "rgba(255,255,255,0.5)", fontSize: 14, padding: 16 },
});
