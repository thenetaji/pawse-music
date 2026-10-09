import type { Shelf, Thumbnail } from "@pawse/music-core";
import { StyleSheet, Text, View } from "react-native";

import { yt } from "../lib/engine";
import { go } from "../lib/nav";
import { display } from "../lib/type";
import { useResource } from "../lib/use-resource";
import { Artwork } from "./artwork";
import { PressScale } from "./ui";

const PALETTE = [
  "#E2455B",
  "#F08A3C",
  "#C9971F",
  "#2E9E6E",
  "#2F86C8",
  "#5B6CF0",
  "#8A4FE0",
  "#C94590",
  "#1F958B",
  "#B85E30",
];

// Keeps YouTube's pastel mood colours readable under white text (lightness ≤ 45%, saturation ≥ 50%).
export function tileColor(hex: string | undefined, i: number) {
  const src = hex?.replace("#", "") ?? "";
  if (!/^[0-9a-f]{6}$/i.test(src)) return PALETTE[i % PALETTE.length];
  let r = Number.parseInt(src.slice(0, 2), 16) / 255;
  let g = Number.parseInt(src.slice(2, 4), 16) / 255;
  let b = Number.parseInt(src.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h =
      max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h /= 6;
  }
  if (s < 0.15) return PALETTE[i % PALETTE.length];
  s = Math.max(s, 0.5);
  l = Math.min(l, 0.45);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  [r, g, b] = [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  return `#${[r, g, b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function MoodTile({
  title,
  params,
  color,
  index,
}: {
  title: string;
  params: string;
  color?: string;
  index: number;
}) {
  const c = tileColor(color, index);
  // Shares the mood page's cache key, so opening the tile is instant.
  const page = useResource<Shelf[]>(`mood:${params}`, () =>
    yt.moodPage(params),
  );
  const covers: Thumbnail[][] = [];
  for (const sh of page.data ?? [])
    for (const it of sh.items)
      if (covers.length < 2 && it.thumbnails.length) covers.push(it.thumbnails);
  return (
    <PressScale
      onPress={() =>
        go(
          `/mood/${encodeURIComponent(params)}?title=${encodeURIComponent(title)}&color=${encodeURIComponent(c)}`,
        )
      }
      style={[styles.tile, { backgroundColor: c }]}
    >
      {covers.length ? (
        <View style={styles.covers} pointerEvents="none">
          {covers[1] ? (
            <Artwork
              thumbnails={covers[1]}
              size={54}
              radius={8}
              style={styles.coverBack}
            />
          ) : null}
          <Artwork
            thumbnails={covers[0]}
            size={62}
            radius={8}
            style={styles.coverFront}
          />
        </View>
      ) : (
        <View style={styles.corner} />
      )}
      <Text style={styles.text} numberOfLines={2}>
        {title}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 84,
    borderRadius: 16,
    padding: 14,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    right: -18,
    top: -18,
    width: 70,
    height: 70,
    borderRadius: 18,
    transform: [{ rotate: "24deg" }],
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  covers: { position: "absolute", right: -6, top: 6, width: 90, height: 80 },
  coverBack: {
    position: "absolute",
    right: 34,
    top: 14,
    transform: [{ rotate: "-14deg" }],
    opacity: 0.85,
  },
  coverFront: {
    position: "absolute",
    right: 4,
    top: 4,
    transform: [{ rotate: "16deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  text: {
    maxWidth: "62%",
    color: "#fff",
    fontSize: 16,
    ...display("800"),
    letterSpacing: -0.2,
  },
});
