import {
  type AudioQuality,
  artistLine,
  type ResolvedStream,
  type Track,
} from "@pawse/music-core";
import { currentStream, normalizeVolume, usePlayerSelect } from "@pawse/player";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { SheetScrollView } from "../../components/pull-to-close";
import { isDownloaded } from "../../data/downloads";
import { haptic } from "../../lib/haptics";
import { networkKind } from "../../lib/net";
import { effectiveQuality } from "../../lib/quality";
import { getSetting } from "../../lib/settings";
import {
  sampleRateText,
  streamFormat,
  streamKbps,
} from "../../lib/stream-info";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";

export type Row = { label: string; value?: string; copy?: boolean };

/** Everything we know about a song; for the playing one, also what the player actually loaded. */
export function showSongInfo(track: Track) {
  showSheet({ header: <SongInfo track={track} />, actions: [] });
}

const SOURCE: Record<Track["source"], string> = {
  youtube: "YouTube Music",
  saavn: "JioSaavn",
  local: "Local file",
};
const QUALITY: Record<AudioQuality, string> = {
  high: "High",
  normal: "Normal",
  saver: "Low",
};

function SongInfo({ track }: { track: Track }) {
  const { height } = useWindowDimensions();
  const playing = usePlayerSelect((s) => s.current?.id === track.id);
  const status = usePlayerSelect((s) => s.status);
  const normalize = usePlayerSelect((s) => s.normalize);
  // Each status change can mean a fresh resolve, so read it again then.
  const stream: ResolvedStream | undefined =
    playing && status ? currentStream() : undefined;
  return (
    <View>
      <View style={s.head}>
        <Artwork thumbnails={track.thumbnails} size={44} radius={7} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            Song info
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {track.title}
          </Text>
        </View>
      </View>
      <SheetScrollView
        style={{ maxHeight: Math.max(260, height * 0.62) }}
        showsVerticalScrollIndicator={false}
      >
        <Group title="Song" rows={songRows(track)} />
        {playing ? (
          <Group
            title="Now playing"
            rows={
              stream
                ? streamRows(track, stream, normalize)
                : [{ label: "Stream", value: "Loading…" }]
            }
          />
        ) : null}
      </SheetScrollView>
    </View>
  );
}

function songRows(t: Track): Row[] {
  const multi = t.artists.length > 1;
  return [
    { label: "Title", value: t.title },
    { label: multi ? "Artists" : "Artist", value: artistLine(t.artists) },
    { label: "Album", value: t.album?.title },
    {
      label: "Duration",
      value: t.durationSec ? clock(t.durationSec) : undefined,
    },
    {
      label: "Type",
      value: t.kind === "video" ? "Music video" : t.kind ? "Song" : undefined,
    },
    { label: "Explicit", value: t.explicit ? "Yes" : "No" },
    { label: "Source", value: SOURCE[t.source] },
    {
      label: t.source === "youtube" ? "Video ID" : "Track ID",
      value: t.id,
      copy: true,
    },
    { label: "Album ID", value: t.album?.id, copy: true },
    ...t.artists.map((a) => ({
      label: multi ? `${a.name} ID` : "Artist ID",
      value: a.id,
      copy: true,
    })),
    {
      label: "Link",
      value:
        t.source === "youtube"
          ? `https://music.youtube.com/watch?v=${t.id}`
          : undefined,
      copy: true,
    },
  ];
}

function streamRows(t: Track, st: ResolvedStream, normalize: boolean): Row[] {
  const { codec, container } = streamFormat(st.mimeType);
  const kbps = streamKbps(st, t.durationSec);
  const size = st.contentLength ? bytes(st.contentLength) : undefined;
  const db = st.loudnessDb ?? t.loudnessDb;
  const local = st.via === "local";
  return [
    {
      label: "Audio",
      value: [codec, kbps && `${kbps} kbps`, size].filter(Boolean).join(" · "),
    },
    {
      label: "Format",
      value: codec === container ? codec : `${codec} in ${container}`,
    },
    { label: "Bitrate", value: kbps ? `${kbps} kbps` : undefined },
    { label: "Sample rate", value: sampleRateText(st.sampleRateHz) },
    { label: "Size", value: size },
    {
      label: "Loudness",
      value:
        db === undefined
          ? undefined
          : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB` +
            (normalize
              ? ` · played at ${Math.round(normalizeVolume(db) * 100)}%`
              : ""),
    },
    { label: "Served by", value: served(st.via) },
    {
      label: "Loaded from",
      value: !local
        ? "Streaming"
        : isDownloaded(t.id)
          ? "Download"
          : "Offline cache",
    },
    { label: "Quality setting", value: qualitySetting() },
  ];
}

export function Group({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter((r) => r.value);
  return (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      <View style={s.card}>
        {shown.map((r, i) => (
          <InfoRow key={r.label} row={r} first={i === 0} />
        ))}
      </View>
    </View>
  );
}

function InfoRow({ row, first }: { row: Row; first: boolean }) {
  const accent = useAccent();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <View style={[s.row, !first && s.sep]}>
      <Text style={s.label}>{row.label}</Text>
      <Text
        style={s.value}
        numberOfLines={row.copy ? 1 : 2}
        ellipsizeMode={row.copy ? "middle" : "tail"}
        selectable
      >
        {row.value}
      </Text>
      {row.copy ? (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${row.label}`}
          onPress={() => {
            void Clipboard.setStringAsync(row.value ?? "");
            haptic.success();
            setCopied(true);
          }}
          style={({ pressed }) => [s.copy, pressed && { opacity: 0.6 }]}
        >
          <Text style={[s.copyText, { color: accent }]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function served(via: string): string {
  if (via === "local") return "This device";
  if (via === "saavn") return "JioSaavn";
  const [kind, client] = via.split(":");
  if (kind === "youtube") return client ? `YouTube · ${client}` : "YouTube";
  return via;
}

function qualitySetting(): string {
  const kind = networkKind();
  const cell = kind === "cellular";
  const choice = getSetting<string>(
    cell ? "qualityCellular" : "quality",
    "auto",
  );
  const now = QUALITY[effectiveQuality()];
  const label =
    choice === "high" || choice === "saver"
      ? QUALITY[choice]
      : `Automatic · ${now}`;
  return `${label} (${cell ? "mobile data" : "Wi-Fi"})`;
}

function bytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function clock(sec: number): string {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#fff", fontSize: 17, ...display("700") },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 2 },
  group: { marginTop: 16 },
  groupTitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginLeft: 4,
    marginBottom: 6,
  },
  card: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  sep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 14 },
  value: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
  },
  copy: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  copyText: { fontSize: 12, fontWeight: "700" },
});
