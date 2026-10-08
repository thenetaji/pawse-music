import type { LyricLine, Lyrics } from "@studio/music-core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { activeLine } from "../../lib/lrc";

type Props = {
  lyrics: Lyrics | null | undefined;
  loading: boolean;
  position: number;
  onSeek: (sec: number) => void;
};

// Full lyrics: the sung line in white, words lighting up as they're sung; tap a line to jump there.
export function LyricsView({ lyrics, loading, position, onSeek }: Props) {
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  const [height, setHeight] = useState(0);
  const [userScrolling, setUserScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ms = position * 1000;
  const lines = useMemo(() => (lyrics?.synced ? lyrics.lines : []), [lyrics]);
  const active = activeLine(lines, ms);

  useEffect(() => {
    if (userScrolling || active < 0 || tops.current[active] === undefined)
      return;
    scroll.current?.scrollTo({
      y: Math.max(0, tops.current[active] - height * 0.3),
      animated: true,
    });
  }, [active, height, userScrolling]);

  if (!lyrics) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {loading ? "Finding lyrics" : "No lyrics for this one"}
        </Text>
      </View>
    );
  }
  if (!lyrics.synced) {
    return (
      <ScrollView
        contentContainerStyle={styles.plainWrap}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.plain}>
          {lyrics.plain ?? lyrics.lines.map((l) => l.text).join("\n")}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scroll}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        clearTimeout(idleTimer.current);
        setUserScrolling(true);
      }}
      onScrollEndDrag={() => {
        idleTimer.current = setTimeout(() => setUserScrolling(false), 2500);
      }}
      contentContainerStyle={{
        paddingTop: height * 0.3,
        paddingBottom: height * 0.6,
        paddingHorizontal: 4,
      }}
    >
      {lines.map((line, i) => (
        <Pressable
          key={i}
          onLayout={(e: LayoutChangeEvent) =>
            (tops.current[i] = e.nativeEvent.layout.y)
          }
          onPress={() => onSeek(line.startMs / 1000 + 0.01)}
          style={styles.linePress}
        >
          <Line
            line={line}
            state={i === active ? "now" : i < active ? "past" : "next"}
            ms={ms}
            distance={Math.abs(i - active)}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Line({
  line,
  state,
  ms,
  distance,
}: {
  line: LyricLine;
  state: "now" | "past" | "next";
  ms: number;
  distance: number;
}) {
  if (!line.text)
    return (
      <Text
        style={[
          styles.line,
          styles.dots,
          { opacity: state === "now" ? 0.9 : 0.25 },
        ]}
      >
        • • •
      </Text>
    );
  const fade = state === "now" ? 1 : Math.max(0.16, 0.42 - distance * 0.05);
  if (state !== "now")
    return (
      <Text style={[styles.line, { color: `rgba(255,255,255,${fade})` }]}>
        {line.text}
      </Text>
    );

  // Words light up as they're sung: real word timings when present, otherwise spread evenly over the line.
  const words = line.words?.length ? line.words : evenWords(line);
  return (
    <Text style={[styles.line, styles.now]}>
      {words.map((w, i) => (
        <Text
          key={i}
          style={{ color: ms >= w.startMs ? "#fff" : "rgba(255,255,255,0.38)" }}
        >
          {w.text}
          {i < words.length - 1 && !w.text.endsWith(" ") ? " " : ""}
        </Text>
      ))}
    </Text>
  );
}

function evenWords(line: LyricLine) {
  const parts = line.text.split(/\s+/).filter(Boolean);
  const span = Math.max(400, (line.endMs - line.startMs) * 0.85);
  return parts.map((text, i) => ({
    text,
    startMs: line.startMs + (span * i) / parts.length,
    endMs: line.startMs + (span * (i + 1)) / parts.length,
  }));
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 17,
    fontWeight: "600",
  },
  plainWrap: { paddingVertical: 24 },
  plain: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "700",
  },
  linePress: { paddingVertical: 9 },
  line: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  now: { color: "#fff" },
  dots: { color: "#fff", letterSpacing: 4 },
});
