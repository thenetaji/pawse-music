import { StyleSheet, Text, View } from "react-native";

import { curvePosition } from "../../lib/audio-fx/curve";

const MARKS: [number, string][] = [
  [100, "100"],
  [1000, "1k"],
  [10000, "10k"],
];
const LABEL = 40;

export function CurveAxis({ width }: { width: number }) {
  return (
    <View style={{ width, height: 18 }}>
      <Text style={[styles.mark, { left: 0, textAlign: "left" }]}>20 Hz</Text>
      {MARKS.map(([hz, label]) => (
        <Text
          key={hz}
          style={[styles.mark, { left: curvePosition(hz) * width - LABEL / 2 }]}
        >
          {label}
        </Text>
      ))}
      <Text style={[styles.mark, { right: 0, textAlign: "right" }]}>20k</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    position: "absolute",
    top: 4,
    width: LABEL,
    textAlign: "center",
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
