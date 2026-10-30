import { player } from "@pawse/player";
import { useMemo, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { showSheet } from "../../components/action-sheet";
import { showToast } from "../../components/toast";
import { Chip } from "../../components/ui";
import { moodMix, useMoodLibrary } from "../../data/mood-library";
import { MOODS, type MoodId } from "../../data/moods";
import { haptic } from "../../lib/haptics";
import { useRegion } from "../../lib/locale";
import { getSetting, setSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";
import { AiDjChip } from "./ai-dj";

const SHARE_SETTING = "moodShare";
const DEFAULT_SHARE = 0.3;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const shareNote = (share: number) =>
  share < 0.15
    ? "Only songs you already have"
    : share < 0.4
      ? "Mostly your songs"
      : share < 0.6
        ? "Half and half"
        : share < 0.85
          ? "Mostly new finds"
          : "Only new finds";

function ShareSlider({
  value,
  onChange,
  accent,
}: {
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  const [shown, setShown] = useState(value);
  const [width, setWidth] = useState(1);
  const pan = useMemo(() => {
    const set = (x: number) => {
      const next = Math.round(clamp01(x / width) * 20) / 20;
      setShown(next);
      onChange(next);
    };
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => set(e.x))
      .onUpdate((e) => set(e.x));
  }, [width, onChange]);
  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(e: LayoutChangeEvent) =>
            setWidth(Math.max(1, e.nativeEvent.layout.width))
          }
          style={styles.hit}
        >
          <View pointerEvents="none" style={styles.track}>
            <View
              style={[
                styles.thumb,
                { left: `${shown * 100}%`, backgroundColor: accent },
              ]}
            />
          </View>
        </View>
      </GestureDetector>
      <View style={styles.ends}>
        <Text style={styles.endText}>Your songs</Text>
        <Text style={styles.endText}>New finds</Text>
      </View>
      <Text style={styles.note}>{shareNote(shown)}</Text>
    </View>
  );
}

export function MoodChips() {
  const accent = useAccent();
  const region = useRegion();
  const pool = useMoodLibrary(region);

  const open = (mood: { id: MoodId; label: string }) => {
    haptic.light();
    const share = { v: getSetting(SHARE_SETTING, DEFAULT_SHARE) };
    showSheet({
      header: (
        <View>
          <Text style={styles.title}>{mood.label}</Text>
          <ShareSlider
            value={share.v}
            accent={accent}
            onChange={(v) => {
              share.v = v;
              setSetting(SHARE_SETTING, v);
            }}
          />
        </View>
      ),
      actions: [
        {
          label: "Play",
          onPress: async () => {
            showToast(`Mixing ${mood.label}`);
            const tracks = await moodMix(mood.id, share.v, pool, region);
            if (!tracks.length) {
              showToast(`Nothing fits ${mood.label} yet`);
              return;
            }
            void player.play(tracks, 0, {
              source: { type: "other", title: `${mood.label} mix` },
            });
          },
        },
      ],
    });
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {MOODS.map((m) => (
        <Chip
          key={m.id}
          label={m.label}
          accent={accent}
          onPress={() => open(m)}
        />
      ))}
      <AiDjChip accent={accent} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 20, gap: 8, marginTop: 14 },
  title: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    ...display("800"),
  },
  hit: { height: 36, justifyContent: "center", marginTop: 14 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
  },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -11,
  },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  endText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12.5,
    ...display("700"),
  },
  note: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },
});
