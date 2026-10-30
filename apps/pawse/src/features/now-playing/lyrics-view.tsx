import type { LyricLine, Lyrics } from "@pawse/music-core";
import { useProgress } from "@pawse/player";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { rightClick } from "../../lib/context-menu";
import { activeLine } from "../../lib/lrc";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { type LatinLine, LatinToggle, useLatinLyrics } from "./latin-lyrics";

type Props = {
  lyrics: Lyrics | null | undefined;
  loading: boolean;
  onSeek: (sec: number) => void;
  onShare?: (line: string) => void;
};

// Full lyrics: the sung line in white, words lighting up as they're sung; tap a line to jump there.
// Reads progress itself, so the player screen around it never re-renders on the 1 s tick.
export function LyricsView(props: Props) {
  const latin = useLatinLyrics(props.lyrics);
  return (
    <View style={styles.root}>
      <LyricsBody {...props} lyrics={latin.lyrics} />
      {latin.can ? <LatinToggle on={latin.on} /> : null}
    </View>
  );
}

function LyricsBody({ lyrics, loading, onSeek, onShare }: Props) {
  const { position } = useProgress();
  const fs = { s: 24, m: 30, l: 36 }[
    useSetting<"s" | "m" | "l">("lyricsSize", "m")
  ];
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  const onTop = useCallback((i: number, y: number) => {
    tops.current[i] = y;
  }, []);
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
        <Row
          key={i}
          i={i}
          fs={fs}
          line={line}
          state={i === active ? "now" : i < active ? "past" : "next"}
          ms={i === active ? ms : 0}
          distance={Math.abs(i - active)}
          onTop={onTop}
          onSeek={onSeek}
          onShare={onShare}
        />
      ))}
    </ScrollView>
  );
}

// A line only redraws when its own state changes, so the 1 s tick touches one row instead of the whole song.
const Row = memo(function Row({
  i,
  onTop,
  line,
  onSeek,
  onShare,
  ...rest
}: {
  i: number;
  onTop: (i: number, y: number) => void;
  line: LyricLine;
  fs: number;
  state: "now" | "past" | "next";
  ms: number;
  distance: number;
  onSeek: (sec: number) => void;
  onShare?: (line: string) => void;
}) {
  return (
    <Pressable
      onLayout={(e: LayoutChangeEvent) => onTop(i, e.nativeEvent.layout.y)}
      onPress={() => onSeek(line.startMs / 1000 + 0.01)}
      onLongPress={() => line.text && onShare?.(line.text)}
      {...rightClick(() => line.text && onShare?.(line.text))}
      style={styles.linePress}
    >
      <Line line={line} {...rest} />
    </Pressable>
  );
});

function Line(p: LineProps) {
  const latin = (p.line as LatinLine).latin;
  return (
    <>
      <PlainLine {...p} />
      {latin ? (
        <Text style={[styles.latin, { fontSize: p.fs * 0.6 }]}>{latin}</Text>
      ) : null}
    </>
  );
}

type LineProps = {
  fs: number;
  line: LyricLine;
  state: "now" | "past" | "next";
  ms: number;
  distance: number;
};

function PlainLine({ line, state, ms, distance, fs }: LineProps) {
  if (!line.text)
    return (
      <Text
        style={[
          styles.line,
          { fontSize: fs, lineHeight: fs * 1.2 },
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
      <Text
        style={[
          styles.line,
          { fontSize: fs, lineHeight: fs * 1.2 },
          { color: `rgba(255,255,255,${fade})` },
        ]}
      >
        {line.text}
      </Text>
    );

  // Words light up as they're sung: real word timings when present, otherwise spread evenly over the line.
  const words = line.words?.length ? line.words : evenWords(line);
  return (
    <Text
      style={[styles.line, { fontSize: fs, lineHeight: fs * 1.2 }, styles.now]}
    >
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
  root: { flex: 1 },
  latin: {
    color: "rgba(255,255,255,0.55)",
    ...display("700"),
    marginTop: 2,
  },
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
    ...display("700"),
  },
  linePress: { paddingVertical: 9 },
  line: {
    fontSize: 30,
    lineHeight: 36,
    ...display("800"),
    letterSpacing: -0.4,
  },
  now: { color: "#fff" },
  dots: { color: "#fff", letterSpacing: 4 },
});
