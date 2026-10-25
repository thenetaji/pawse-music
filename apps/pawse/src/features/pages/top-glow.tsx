import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

import { useNowPalette } from "../now-playing/now-palette";

const OVERSCROLL = 800;

// The current song's colours bleed softly into the top of every page.
export function TopGlow({
  height = 420,
  colors,
}: {
  height?: number;
  colors?: string[];
}) {
  const palette = useNowPalette((s) => s.palette);
  const c = colors ?? [palette.colors[0], palette.colors[1]];
  // Reaches far above the page in its top colour, so pulling down past the top shows colour, not a black edge.
  const total = height + OVERSCROLL;
  const top = OVERSCROLL / total;
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        withAlpha(c[0], 0.85),
        withAlpha(c[0], 0.85),
        withAlpha(c[1] ?? c[0], 0.35),
        "rgba(0,0,0,0)",
      ]}
      locations={[0, top, top + 0.45 * (1 - top), 1]}
      style={[StyleSheet.absoluteFill, { top: -OVERSCROLL, height: total }]}
    />
  );
}

function withAlpha(c: string, a: number) {
  if (c.startsWith("#") && c.length === 7) {
    const n = Number.parseInt(c.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = c.match(/\d+/g);
  return m ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : c;
}
