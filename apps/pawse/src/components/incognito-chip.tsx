import { StyleSheet, Text } from "react-native";

import { setIncognito, useIncognito } from "../lib/incognito";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import { IncognitoGlyph } from "./glyphs";
import { PressScale } from "./ui";

/** Shown while incognito is on, so it is never left on by accident; tap to turn it off. */
export function IncognitoChip() {
  const on = useIncognito();
  if (!on) return null;
  return (
    <PressScale
      onPress={() =>
        showSheet({
          header: (
            <Text style={styles.note}>
              Nothing you play, watch or search goes into your history, Continue
              or recommendations, or into YouTube&apos;s history.
            </Text>
          ),
          actions: [
            {
              label: "Turn off incognito",
              icon: (c) => <IncognitoGlyph size={22} color={c} />,
              onPress: () => setIncognito(false),
            },
          ],
        })
      }
      style={styles.chip}
      accessibilityLabel="Incognito is on. Tap to turn it off."
    >
      <IncognitoGlyph size={16} color="#fff" />
      <Text style={styles.text}>Incognito</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  text: { color: "#fff", fontSize: 13, ...display("700") },
  note: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
