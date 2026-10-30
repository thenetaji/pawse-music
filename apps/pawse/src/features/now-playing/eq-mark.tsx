import { StyleSheet, Text } from "react-native";

import { useEqStatus } from "../../lib/audio-fx/use-eq-status";

/** A small "EQ" while the equaliser is changing this song; the quality chip in the time row carries it. */
export function EqMark() {
  if (!useEqStatus().applied) return null;
  return <Text style={styles.mark}>EQ</Text>;
}

const styles = StyleSheet.create({
  mark: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
