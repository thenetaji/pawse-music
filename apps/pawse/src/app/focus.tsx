import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { FocusGlyph } from "../components/glyphs";
import { Foot, Link, Pick, Section, Toggle } from "../components/settings-rows";
import { Screen } from "../components/ui";
import { useAccent } from "../features/now-playing/now-palette";
import { setFocusMode, useFocusMode } from "../lib/focus";
import { haptic } from "../lib/haptics";
import { push } from "../lib/nav";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";

/** Focus mode: YouTube without the pull. One switch for all of it, then each part on its own. */
export default function Focus() {
  const on = useFocusMode();
  const accent = useAccent();
  const calm = useSetting("videoCalm", false);
  return (
    <Screen title="Focus mode" back bottomInset={60}>
      <Pressable
        onPress={() => {
          haptic.tick();
          setFocusMode(!on);
        }}
        style={[styles.hero, on && { borderColor: accent }]}
      >
        <View style={[styles.badge, { backgroundColor: on ? accent : "#222" }]}>
          <FocusGlyph size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Focus mode</Text>
          <Text style={styles.heroSub}>
            Only what you came for: no comments, counts, suggestions or
            autoplay. Home ends when you&apos;re caught up.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={(v) => {
            haptic.tick();
            setFocusMode(v);
          }}
          trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
          thumbColor="#fff"
        />
      </Pressable>

      <Section title="Watch page">
        <Toggle k="hideComments" label="Hide comments" def={calm} />
        <Toggle
          k="hideCounts"
          label="Hide views, likes and subscribers"
          def={calm}
        />
        <Toggle k="hideUpNext" label="Hide Up next" def={calm} />
        <Toggle k="videoAutoplay" label="Play the next video" def={false} />
      </Section>
      <Foot>
        Hide Up next also leaves the end of a video blank, so nothing pulls you
        into another one.
      </Foot>

      <Section title="Feeds and search">
        <Toggle k="plainThumbs" label="Plain thumbnails" def={false} />
        <Toggle k="dearrow" label="Honest titles (DeArrow)" def />
        <Toggle
          k="hideSearchTrends"
          label="Hide search suggestions"
          def={false}
        />
        <Link label="Choose Home sections" onPress={() => push("/edit-home")} />
        <Link
          label="Blocked channels and words"
          onPress={() => push("/blocked")}
        />
      </Section>
      <Foot>
        Plain thumbnails show a still from the middle of the video instead of
        the picture made to be clicked. Pin videos, channels and playlists to
        Home from any ⋯ menu to build it your way.
      </Foot>

      <Section title="Time">
        <Pick<number>
          k="breakMinutes"
          label="Remind me to take a break"
          def={0}
          options={[
            [0, "Off"],
            [15, "Every 15 minutes"],
            [30, "Every 30 minutes"],
            [60, "Every hour"],
            [90, "Every 90 minutes"],
          ]}
        />
      </Section>
      <Foot>The video pauses and asks if you want to keep going.</Foot>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: 17, ...display("800") },
  heroSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 3,
  },
});
