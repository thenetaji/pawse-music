import { artistLine } from "@pawse/music-core";
import {
  emitPlayerEvent,
  player,
  usePlayerState,
  useProgress,
} from "@pawse/player";
import { useEffect, useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { TrackArt } from "../../components/artwork";
import { useLibrary } from "../../data/library";
import { push } from "../../lib/nav";
import { openAlbum, openArtist } from "../../lib/song-links";
import { display } from "../../lib/type";
import { showTrackActions } from "../library/track-actions";
import {
  HeartGlyph,
  LyricsGlyph,
  MoreGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PrevGlyph,
  QueueGlyph,
} from "../now-playing/icons";
import { useAccent } from "../now-playing/now-palette";
import { RepeatIcon, ShuffleIcon } from "./icons";

// React Native Web adds hover to the pressable state.
type Hover = PressableStateCallbackType & { hovered?: boolean };
const DIM = "rgba(255,255,255,0.62)";
const FAINT = "rgba(255,255,255,0.4)";

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Desktop: the song, the transport with a seek bar, and lyrics/queue, always at the bottom. */
export function PlayerBar() {
  const { current, status, shuffle, repeat } = usePlayerState();
  const { position, duration: d } = useProgress();
  const duration = d || current?.durationSec || 0;
  const accent = useAccent();
  const liked = useLibrary((s) =>
    current ? s.liked.some((t) => t.id === current.id) : false,
  );
  const playing =
    status === "playing" || status === "buffering" || status === "loading";
  const busy = status === "buffering" || status === "loading";

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {current ? (
          <>
            <Pressable onPress={() => push("/now-playing")}>
              <TrackArt track={current} size={56} radius={8} />
            </Pressable>
            <View style={styles.meta}>
              <Pressable onPress={() => void openAlbum(current)}>
                {({ hovered }: Hover) => (
                  <Text
                    numberOfLines={1}
                    style={[styles.title, hovered && styles.underline]}
                  >
                    {current.title}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={() => void openArtist(current)}>
                {({ hovered }: Hover) => (
                  <Text
                    numberOfLines={1}
                    style={[styles.artist, hovered && styles.underline]}
                  >
                    {artistLine(current.artists)}
                  </Text>
                )}
              </Pressable>
            </View>
            <IconButton
              label={liked ? "Remove from Liked" : "Like"}
              onPress={() => {
                if (useLibrary.getState().toggleLike(current))
                  emitPlayerEvent("liked", current);
              }}
            >
              <HeartGlyph
                size={20}
                filled={liked}
                color={liked ? accent : DIM}
              />
            </IconButton>
          </>
        ) : (
          <Text style={styles.idle}>Pick something to play</Text>
        )}
      </View>

      <View style={styles.center}>
        <View style={styles.transport}>
          <IconButton
            label={shuffle ? "Shuffle off" : "Shuffle"}
            onPress={() => player.setShuffle(!shuffle)}
          >
            <ShuffleIcon color={shuffle ? accent : DIM} />
          </IconButton>
          <IconButton label="Previous" onPress={() => player.previous()}>
            <PrevGlyph size={24} />
          </IconButton>
          <Pressable
            accessibilityLabel={playing ? "Pause" : "Play"}
            disabled={!current}
            onPress={() => player.toggle()}
            style={({ hovered, pressed }: Hover) => [
              styles.play,
              hovered && styles.playHover,
              pressed && styles.pressed,
              !current && styles.disabled,
            ]}
          >
            {playing && !busy ? (
              <PauseGlyph size={20} color="#000" />
            ) : busy ? (
              <View style={styles.spinner} />
            ) : (
              <PlayGlyph size={20} color="#000" />
            )}
          </Pressable>
          <IconButton label="Next" onPress={() => player.next()}>
            <NextGlyph size={24} />
          </IconButton>
          <IconButton
            label={`Repeat ${repeat}`}
            onPress={() =>
              player.setRepeat(
                repeat === "off" ? "all" : repeat === "all" ? "one" : "off",
              )
            }
          >
            <RepeatIcon
              one={repeat === "one"}
              color={repeat === "off" ? DIM : accent}
            />
          </IconButton>
        </View>
        <SeekBar
          position={position}
          duration={duration}
          accent={accent}
          enabled={!!current}
        />
      </View>

      <View style={styles.right}>
        <IconButton
          label="Lyrics"
          onPress={() => current && push("/now-playing?mode=lyrics")}
        >
          <LyricsGlyph size={22} color={DIM} />
        </IconButton>
        <IconButton label="Queue" onPress={() => current && push("/queue")}>
          <QueueGlyph size={22} color={DIM} />
        </IconButton>
        <IconButton
          label="More"
          onPress={() =>
            current && showTrackActions(current, { fromPlayer: true })
          }
        >
          <MoreGlyph size={22} color={DIM} />
        </IconButton>
      </View>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: Hover) => [
        styles.icon,
        hovered && styles.iconHover,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

// Click or drag anywhere on the line; the thumb shows on hover like most desktop players.
function SeekBar({
  position,
  duration,
  accent,
  enabled,
}: {
  position: number;
  duration: number;
  accent: string;
  enabled: boolean;
}) {
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  // Holds the released spot until the next progress read catches up.
  const [held, setHeld] = useState<number | null>(null);
  useEffect(() => {
    if (held === null) return;
    const t = setTimeout(() => setHeld(null), 1200);
    return () => clearTimeout(t);
  }, [held]);

  const at = (x: number) => Math.min(1, Math.max(0, x / width));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled && duration > 0)
    .minDistance(0)
    .onBegin((e) => setDrag(at(e.x)))
    .onUpdate((e) => setDrag(at(e.x)))
    .onEnd((e) => {
      const f = at(e.x);
      setHeld(f);
      player.seekTo(f * duration);
    })
    .onFinalize(() => setDrag(null));

  const frac =
    drag ?? held ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const shown = drag !== null ? drag * duration : position;
  const active = hover || drag !== null;

  return (
    <View style={styles.seek}>
      <Text style={[styles.time, styles.timeLeft]}>
        {enabled ? fmt(shown) : ""}
      </Text>
      <GestureDetector gesture={pan}>
        <Pressable
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
          style={styles.track}
        >
          <View style={styles.line}>
            <View
              style={[
                styles.fill,
                {
                  width: `${frac * 100}%`,
                  backgroundColor: active ? accent : "#fff",
                },
              ]}
            />
          </View>
          {active && enabled ? (
            <View
              pointerEvents="none"
              style={[styles.thumb, { left: `${frac * 100}%` }]}
            />
          ) : null}
        </Pressable>
      </GestureDetector>
      <Text style={styles.time}>
        {enabled && duration > 0 ? fmt(duration) : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 88,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: "#0B0B0E",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  left: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  meta: { flexShrink: 1, minWidth: 0, gap: 2 },
  title: { color: "#fff", fontSize: 14, ...display("700") },
  artist: { color: DIM, fontSize: 12.5 },
  underline: { textDecorationLine: "underline" },
  idle: { color: FAINT, fontSize: 13 },
  center: {
    flex: 1.4,
    flexBasis: 0,
    maxWidth: 680,
    alignItems: "center",
    gap: 4,
  },
  transport: { flexDirection: "row", alignItems: "center", gap: 10 },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  playHover: { transform: [{ scale: 1.06 }] },
  disabled: { opacity: 0.4 },
  spinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: "rgba(0,0,0,0.25)",
    borderTopColor: "#000",
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iconHover: { backgroundColor: "rgba(255,255,255,0.08)" },
  pressed: { opacity: 0.6 },
  seek: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  time: {
    width: 40,
    color: FAINT,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  timeLeft: { textAlign: "right" },
  track: { flex: 1, height: 16, justifyContent: "center" },
  line: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2 },
  thumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    top: 2,
    backgroundColor: "#fff",
  },
  right: {
    flex: 1,
    flexBasis: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
  },
});
