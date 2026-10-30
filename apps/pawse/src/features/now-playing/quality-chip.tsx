import type { ResolvedStream, Track } from "@pawse/music-core";
import { useCurrentStream, usePlayerSelect } from "@pawse/player";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hideSheet, showSheet } from "../../components/action-sheet";
import {
  AUDIO_FORMATS,
  type AudioFormat,
  audioFormatLabel,
  formatBlock,
  lowReason,
} from "../../lib/audio-format";
import { useEqStatus } from "../../lib/audio-fx/use-eq-status";
import { haptic } from "../../lib/haptics";
import { getSetting, useSetting } from "../../lib/settings";
import {
  isLowTier,
  normalizeGainDb,
  qualityBadge,
  qualityNote,
  sampleRateText,
  streamFormat,
  streamKbps,
  streamSource,
} from "../../lib/stream-info";
import { chooseFormat, playInHigh } from "../../lib/switch-format";
import { display } from "../../lib/type";
import { Group, type Row } from "../library/song-info";
import { EqMark } from "./eq-mark";
import { useAccent } from "./now-palette";

/** What the song plays as ("320 kbps", "AAC 256") with the equaliser's mark, centred in the time row. */
export function QualityChip() {
  const stream = useCurrentStream();
  const length = usePlayerSelect((s) => s.current?.durationSec);
  const accent = useAccent();
  const eq = useEqStatus().applied;
  const badge = stream ? qualityBadge(stream, length) : undefined;
  if (!badge && !eq) return null;
  return (
    <View pointerEvents="box-none" style={styles.center}>
      <Pressable
        disabled={!badge}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={badge ? `Sound quality, ${badge.label}` : "EQ"}
        onPress={() => {
          haptic.light();
          showSheet({ header: <QualityInfo />, actions: [] });
        }}
        style={[styles.pill, badge?.hq && styles.pillHq]}
      >
        {eq ? <EqMark /> : null}
        {eq && badge ? <View style={styles.divider} /> : null}
        {badge ? (
          <Text style={[styles.label, badge.hq && { color: accent }]}>
            {badge.hq ? <Text style={styles.hq}>HQ </Text> : null}
            {badge.label}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function QualityInfo() {
  const stream = useCurrentStream();
  const track = usePlayerSelect((s) => s.current);
  const normalize = usePlayerSelect((s) => s.normalize);
  const crossfade = useSetting<number>("crossfade", 0);
  const gapless = useSetting("gapless", true);
  const format = useSetting<AudioFormat>("audioFormat", "best");
  const rows: Row[] = [];
  const low = !!stream && isLowTier(stream, track?.durationSec);
  const note =
    stream &&
    qualityNote(stream, track?.durationSec, low ? lowReason() : undefined);
  if (stream) {
    const kbps = streamKbps(stream, track?.durationSec);
    const gain = normalizeGainDb(stream.loudnessDb ?? track?.loudnessDb);
    rows.push(
      {
        label: "Format",
        value:
          format === "best"
            ? `Best available · ${streamFormat(stream.mimeType).codec}`
            : audioFormatLabel(format),
        onPress: () => pickFormat(track, stream),
      },
      { label: "Source", value: streamSource(stream.via) },
      { label: "Codec", value: streamFormat(stream.mimeType).codec },
      { label: "Bitrate", value: kbps ? `${kbps} kbps` : undefined },
      { label: "Sample rate", value: sampleRateText(stream.sampleRateHz) },
      {
        label: "Loudness",
        value: !normalize
          ? "Off"
          : gain
            ? `On, ${gain > 0 ? "+" : "−"}${Math.abs(gain)} dB`
            : "On, no change",
      },
    );
    if (low)
      rows.push({
        label: "Quality",
        value: "Play in high quality",
        onPress: () => {
          haptic.light();
          hideSheet();
          void playInHigh();
        },
      });
  }
  rows.push(
    {
      label: "Crossfade",
      value: crossfade > 0 ? `${crossfade} s` : "Off",
    },
    { label: "Gapless albums", value: gapless ? "On" : "Off" },
  );
  return (
    <View>
      <Text style={styles.title}>Sound quality</Text>
      {track ? (
        <Text style={styles.sub} numberOfLines={1}>
          {track.title}
        </Text>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <Group
        title="Now playing"
        rows={stream ? rows : [{ label: "Stream", value: "Loading…" }, ...rows]}
      />
    </View>
  );
}

const HINT: Record<AudioFormat, string> = {
  best: "JioSaavn 320 when it is certainly the song, else Opus, else AAC",
  opus: "YouTube's best quality",
  aac: "YouTube's standard quality, plays everywhere",
  saavn: "320 kbps when JioSaavn has a certain match",
};

function pickFormat(track: Track | undefined, stream: ResolvedStream) {
  const current = getSetting<AudioFormat>("audioFormat", "best");
  showSheet({
    title: "Audio format",
    actions: AUDIO_FORMATS.map(([v, label]) => {
      const why = formatBlock(v, track, stream);
      return {
        label,
        checked: v === current,
        disabled: !!why,
        sub: why ?? HINT[v],
        onPress: () => void chooseFormat(v),
      };
    }),
  });
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  pillHq: { borderColor: "rgba(255,255,255,0.32)" },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  label: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  hq: { fontWeight: "800", letterSpacing: 0.6 },
  title: { color: "#fff", fontSize: 17, ...display("700") },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 2 },
  note: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
});
