import type { LyricLine, Lyrics } from "@pawse/music-core";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { haptic } from "../../lib/haptics";
import { canRomanize, romanize } from "../../lib/romanize";
import { setSetting, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";

export type LatinLine = LyricLine & { latin?: string };

const sample = (l: Lyrics) =>
  l.lines.some((x) => canRomanize(x.text)) || canRomanize(l.plain ?? "");

function convert(l: Lyrics, style: "under" | "instead"): Lyrics {
  if (style === "instead")
    return {
      ...l,
      plain: l.plain && romanize(l.plain),
      lines: l.lines.map((x) => ({
        ...x,
        text: romanize(x.text),
        words: x.words?.map((w) => ({ ...w, text: romanize(w.text) })),
      })),
    };
  const plain = l.plain
    ?.split("\n")
    .flatMap((row) => {
      const r = romanize(row);
      return r === row ? [row] : [row, r];
    })
    .join("\n");
  return {
    ...l,
    plain,
    lines: l.lines.map((x): LatinLine => {
      const latin = romanize(x.text);
      return latin === x.text ? x : { ...x, latin };
    }),
  };
}

export function useLatinLyrics(lyrics: Lyrics | null | undefined) {
  const on = useSetting("lyricsLatin", false);
  const style = useSetting<"under" | "instead">("lyricsLatinStyle", "under");
  const can = useMemo(() => !!lyrics && sample(lyrics), [lyrics]);
  const shown = useMemo(
    () => (lyrics && can && on ? convert(lyrics, style) : lyrics),
    [lyrics, can, on, style],
  );
  return { lyrics: shown, can, on };
}

export function LatinToggle({ on }: { on: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        setSetting("lyricsLatin", !on);
      }}
      accessibilityLabel="Show in Latin letters"
      accessibilityState={{ selected: on }}
      style={[styles.pill, on && styles.on]}
    >
      <Text style={[styles.text, on && styles.textOn]}>Aa</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 44,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  on: { backgroundColor: "#fff" },
  text: { color: "#fff", fontSize: 14, ...display("800") },
  textOn: { color: "#000" },
});
