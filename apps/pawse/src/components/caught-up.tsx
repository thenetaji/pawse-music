import { StyleSheet, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Cat, type CatColor } from "../features/cat/cat";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";

/** Where a calm page ends: the cat asleep, no feed below. */
export function CaughtUp({ note }: { note?: string }) {
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  return (
    <Animated.View entering={FadeInDown.duration(420)} style={styles.caught}>
      <Cat mood="sleep" size={84} color={color} />
      <Text style={styles.title}>You’re all caught up</Text>
      <Text style={styles.sub}>
        {note ?? `${name} is napping. Search when you want something new.`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caught: { alignItems: "center", marginTop: 36, paddingHorizontal: 40 },
  title: { color: "#fff", fontSize: 19, marginTop: 10, ...display("800") },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
});
