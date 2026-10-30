import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloseGlyph } from "../../components/glyphs";
import type { SponsorSpot } from "../../lib/ai/sponsors";
import { contributing, sendSegment } from "../../lib/contribute";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { type Clock, useClock } from "./video-controls";

const LEAD_SEC = 2;
const TAIL_SEC = 3;

export function SponsorPrompt({
  spots,
  clock,
  videoId,
  durationSec,
  onSkip,
}: {
  spots: SponsorSpot[];
  clock: Clock;
  videoId: string;
  durationSec?: number;
  onSkip: (sec: number) => void;
}) {
  const now = useClock(clock);
  const [closed, setClosed] = useState<number[]>([]);
  const [sent, setSent] = useState<number[]>([]);
  const spot = spots.find(
    (s) =>
      now >= s.start - LEAD_SEC &&
      now < s.end - TAIL_SEC &&
      !closed.includes(s.start),
  );
  if (!spot) return null;
  const close = () => setClosed((c) => [...c, spot.start]);
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          haptic.light();
          close();
          onSkip(spot.end);
        }}
        style={styles.pill}
        accessibilityLabel="Skip sponsor"
      >
        <Text style={styles.text}>Skip sponsor?</Text>
      </Pressable>
      {contributing() && !sent.includes(spot.start) ? (
        <Pressable
          onPress={() => {
            haptic.light();
            setSent((s) => [...s, spot.start]);
            sendSegment({
              videoId,
              start: Math.round(spot.start),
              end: Math.round(spot.end),
              category: "sponsor",
              duration: durationSec,
            });
          }}
          style={styles.pill}
        >
          <Text style={styles.text}>Add to SponsorBlock</Text>
        </Pressable>
      ) : null}
      <Pressable
        hitSlop={10}
        onPress={close}
        style={styles.close}
        accessibilityLabel="Dismiss"
      >
        <CloseGlyph size={11} weight={3} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 12,
    bottom: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  text: { color: "#fff", fontSize: 13, ...display("700") },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
});
