import { artistLine, type Track } from "@pawse/music-core";
import { player, usePlayerSelect } from "@pawse/player";
import { memo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { useDownload } from "../data/downloads";
import { showTrackActions } from "../features/library/track-actions";
import { MoreGlyph } from "../features/now-playing/icons";
import { useAccent } from "../features/now-playing/now-palette";
import { haptic } from "../lib/haptics";
import { display } from "../lib/type";
import { Artwork } from "./artwork";
import { EqBars } from "./eq-bars";

type Props = {
  track: Track;
  onPress: () => void;
  index?: number;
  showArt?: boolean;
  subtitle?: string;
  /** Off inside horizontal carousels, where a sideways swipe should scroll. */
  swipeable?: boolean;
  /** On Home and History, the menu offers removing the song from both. */
  removable?: boolean;
};

// Swipe right to play next, left to add to the queue; long-press for everything else.
export const TrackRow = memo(function TrackRow({
  track,
  onPress,
  index,
  showArt = true,
  subtitle,
  swipeable = true,
  removable,
}: Props) {
  // Narrow selectors: a song change or play/pause re-renders only the rows it touches.
  const current = usePlayerSelect((s) => s.current?.id === track.id);
  const playing = usePlayerSelect(
    (s) => s.current?.id === track.id && s.status === "playing",
  );
  const dl = useDownload(track.id);
  const swipe = useRef<SwipeableMethods>(null);
  const sub =
    subtitle ??
    [artistLine(track.artists), track.album?.title].filter(Boolean).join(" · ");
  const content = (
    <Pressable
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      onLongPress={() => showTrackActions(track, { removable })}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {showArt ? (
        <View>
          <Artwork thumbnails={track.thumbnails} size={50} radius={7} />
          {current ? (
            <View style={styles.overlay}>
              <EqBars color="#fff" playing={playing} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.num}>
          {current ? (
            <AccentEq playing={playing} />
          ) : (
            <Text style={styles.numText}>{index}</Text>
          )}
        </View>
      )}
      <View style={styles.text}>
        <Title current={current} explicit={!!track.explicit}>
          {track.title}
        </Title>
        <View style={styles.subRow}>
          {dl.state === "done" ? (
            <DownloadedDot />
          ) : dl.state === "downloading" ? (
            <Percent value={dl.progress} />
          ) : null}
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>
      <Pressable
        hitSlop={12}
        onPress={() => showTrackActions(track, { removable })}
        style={styles.more}
      >
        <MoreGlyph size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </Pressable>
  );
  if (!swipeable) return content;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.8}
      leftThreshold={70}
      rightThreshold={70}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(_, t) => <PlayNextAction translation={t} />}
      renderRightActions={(_, t) => (
        <SwipeAction
          translation={t}
          side="right"
          color="#2B2B34"
          textColor="#fff"
          label="Add to queue"
        />
      )}
      onSwipeableWillOpen={(dir) => {
        haptic.medium();
        if (dir === "right") player.addNext(track);
        else player.addToQueue(track);
        setTimeout(() => swipe.current?.close(), 180);
      }}
    >
      {content}
    </ReanimatedSwipeable>
  );
});

// The accent changes with every song; only these small pieces read it, not every row.
function Title({
  current,
  explicit,
  children,
}: {
  current: boolean;
  explicit: boolean;
  children: string;
}) {
  const body = (
    <>
      {explicit ? <Text style={styles.e}>E </Text> : null}
      {children}
    </>
  );
  return current ? (
    <AccentTitle>{body}</AccentTitle>
  ) : (
    <Text style={styles.title} numberOfLines={1}>
      {body}
    </Text>
  );
}

function AccentTitle({ children }: { children: React.ReactNode }) {
  const accent = useAccent();
  return (
    <Text style={[styles.title, { color: accent }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

function AccentEq({ playing }: { playing: boolean }) {
  return <EqBars color={useAccent()} playing={playing} />;
}

function Percent({ value }: { value: number }) {
  const accent = useAccent();
  return (
    <Text style={[styles.pct, { color: accent }]}>
      {Math.round(value * 100)}%
    </Text>
  );
}

function PlayNextAction({ translation }: { translation: SharedValue<number> }) {
  return (
    <SwipeAction
      translation={translation}
      side="left"
      color={useAccent()}
      textColor="#000"
      label="Play next"
    />
  );
}

// Rows are see-through so page colours show behind them; the colour fills only the gap the row slid away from.
function SwipeAction({
  translation,
  side,
  color,
  textColor,
  label,
}: {
  translation: SharedValue<number>;
  side: "left" | "right";
  color: string;
  textColor: string;
  label: string;
}) {
  const strip = useAnimatedStyle(() => ({
    width: Math.max(
      0,
      side === "left" ? translation.value : -translation.value,
    ),
  }));
  return (
    <View style={styles.action}>
      <Animated.View
        style={[
          styles.strip,
          side === "left" ? styles.stripLeft : styles.stripRight,
          { backgroundColor: color },
          strip,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.actionText,
            { color: textColor, textAlign: side === "left" ? "left" : "right" },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

function DownloadedDot() {
  const color = useAccent();
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill={color} />
      <Path
        d="M12 7v7M8.5 11l3.5 3.5 3.5-3.5"
        stroke="#000"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  overlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  num: { width: 26, alignItems: "center" },
  numText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  e: { color: "rgba(255,255,255,0.5)", fontSize: 11, ...display("800") },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  sub: { flexShrink: 1, color: "rgba(255,255,255,0.5)", fontSize: 13.5 },
  pct: { fontSize: 11, ...display("800") },
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  action: { flex: 1 },
  strip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  stripLeft: { left: 0, alignItems: "flex-start" },
  stripRight: { right: 0, alignItems: "flex-end" },
  actionText: {
    width: 150,
    paddingHorizontal: 22,
    fontSize: 15,
    ...display("800"),
  },
});
