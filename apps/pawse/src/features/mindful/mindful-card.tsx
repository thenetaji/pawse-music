import { Modal, StyleSheet, Text, View } from "react-native";

import { PressScale } from "../../components/ui";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { Cat, type CatColor } from "../cat/cat";
import { closeWatch, useWatch } from "../watch/store";
import { limitWord } from "./mindful-core";
import {
  grantMoreTime,
  hideMindfulCard,
  useMindfulCard,
} from "./mindful-state";

export function MindfulCard() {
  const open = useMindfulCard((s) => s.open);
  const limit = useSetting("mindfulLimit", 0);
  const name = useSetting("catName", "Mochi");
  const color = useSetting<CatColor>("catColor", "orange");

  const done = () => {
    haptic.light();
    closeWatch();
    hideMindfulCard();
  };
  const more = () => {
    haptic.light();
    grantMoreTime();
    hideMindfulCard();
    const { playing, player } = useWatch.getState();
    if (!playing) player?.toggle();
  };

  return (
    <Modal
      visible={open && limit > 0}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={done}
    >
      <View style={styles.root}>
        <Cat mood="sleep" size={170} color={color} />
        <Text style={styles.title}>
          That’s your {limitWord(limit)} for today
        </Text>
        <Text style={styles.body}>
          Music keeps playing. {name} is going to sleep, and the videos will be
          here tomorrow.
        </Text>
        <PressScale onPress={done} style={styles.primary}>
          <Text style={styles.primaryText}>Done for today</Text>
        </PressScale>
        <PressScale onPress={more} style={styles.secondary}>
          <Text style={styles.secondaryText}>5 more minutes</Text>
        </PressScale>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    textAlign: "center",
    marginTop: 24,
    ...display("800"),
    letterSpacing: -0.5,
  },
  body: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 36,
  },
  primary: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  primaryText: { color: "#000", fontSize: 17, ...display("800") },
  secondary: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    ...display("700"),
  },
});
