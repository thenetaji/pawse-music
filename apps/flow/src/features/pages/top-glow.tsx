import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

import { useNowPalette } from "../now-playing/now-palette";

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
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        withAlpha(c[0], 0.85),
        withAlpha(c[1] ?? c[0], 0.35),
        "rgba(0,0,0,0)",
      ]}
      locations={[0, 0.45, 1]}
      style={[StyleSheet.absoluteFill, { height }]}
    />
  );
}

function withAlpha(rgb: string, a: number) {
  const m = rgb.match(/\d+/g);
  return m ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : rgb;
}
