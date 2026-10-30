import { Pressable, StyleSheet, Text, View } from "react-native";
import { styles as rows } from "../../components/settings-rows";
import { haptic } from "../../lib/haptics";
import { setSetting, useSetting } from "../../lib/settings";
import { useAccent } from "../now-playing/now-palette";

export const ISLAND_STYLE_OPTIONS = [
  ["wire", "Cat on the wire", "rides the progress bar like a headphone cable"],
  ["classic", "Classic", "Artwork, the time left and the bar"],
  ["lyrics", "Lyrics", "The line being sung. Needs synced lyrics"],
  ["paws", "Paw controls", "Play, pause and next as paw prints"],
  ["time", "Time left", "No cat, just the time left"],
] as const;

type Id = (typeof ISLAND_STYLE_OPTIONS)[number][0];

export function IslandStylePicker({ catName }: { catName: string }) {
  const saved = useSetting<string>("islandStyle", "wire");
  // Older versions saved "cat" for the cat layout.
  const value: Id = ISLAND_STYLE_OPTIONS.some(([id]) => id === saved)
    ? (saved as Id)
    : "wire";
  const accent = useAccent();
  return (
    <>
      {ISLAND_STYLE_OPTIONS.map(([id, title, about]) => (
        <Pressable
          key={id}
          onPress={() => {
            haptic.tick();
            setSetting("islandStyle", id);
          }}
          style={({ pressed }) => [s.row, pressed && rows.pressed]}
        >
          <Preview id={id} accent={accent} />
          <View style={s.text}>
            <Text style={rows.label}>{title}</Text>
            <Text style={s.about}>
              {id === "wire" ? `${catName} ${about}` : about}
            </Text>
          </View>
          <View
            style={[
              s.dot,
              value === id && { backgroundColor: accent, borderColor: accent },
            ]}
          />
        </Pressable>
      ))}
    </>
  );
}

function Preview({ id, accent }: { id: Id; accent: string }) {
  const cat = id === "wire" || id === "lyrics" || id === "paws";
  return (
    <View style={s.card}>
      <View style={s.top}>
        <View style={[s.art, { borderColor: accent }]} />
        <View style={s.lines}>
          {id === "lyrics" ? (
            <>
              <View style={[s.line, s.faint]} />
              <View style={[s.line, s.bright]} />
              <View style={[s.line, s.bright, { width: 14 }]} />
            </>
          ) : (
            <>
              <View style={[s.line, s.bright]} />
              <View style={[s.line, s.faint]} />
            </>
          )}
        </View>
        {cat ? (
          <View style={[s.cat, { backgroundColor: accent }]} />
        ) : (
          <View style={[s.ring, { borderColor: accent }]} />
        )}
      </View>
      {id === "paws" ? (
        <View style={s.paws}>
          <View style={[s.paw, { backgroundColor: accent }]} />
          <View style={[s.paw, { backgroundColor: accent }]} />
        </View>
      ) : (
        <View style={s.track}>
          <View style={[s.fill, { backgroundColor: accent }]} />
          {id === "wire" ? (
            <View style={[s.rider, { backgroundColor: accent }]} />
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  text: { flex: 1, gap: 2 },
  about: { color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 17 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  card: {
    width: 76,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#000",
    padding: 6,
    justifyContent: "space-between",
  },
  top: { flexDirection: "row", alignItems: "center", gap: 5 },
  art: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  lines: { flex: 1, gap: 3 },
  line: { height: 3, borderRadius: 2 },
  bright: { width: "100%", backgroundColor: "rgba(255,255,255,0.85)" },
  faint: { width: "60%", backgroundColor: "rgba(255,255,255,0.35)" },
  cat: { width: 12, height: 12, borderRadius: 6 },
  ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
  },
  fill: { width: "45%", height: 3, borderRadius: 2 },
  rider: {
    position: "absolute",
    left: "40%",
    top: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paws: { flexDirection: "row", gap: 6, justifyContent: "center" },
  paw: { width: 9, height: 7, borderRadius: 4, opacity: 0.8 },
});
