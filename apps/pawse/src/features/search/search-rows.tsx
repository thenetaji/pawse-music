import { useNetInfo } from "@react-native-community/netinfo";
import type { CatalogItem, Track } from "@pawse/music-core";
import { player, type RadioSeed } from "@pawse/player";
import {
  memo,
  type ReactNode,
  useEffectEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Artwork } from "../../components/artwork";
import { CloseGlyph, PlayNextGlyph, RadioGlyph } from "../../components/glyphs";
import { openItem, showItemActions } from "../../components/shelf";
import { SwipeRow, swipedRecently } from "../../components/swipe-row";
import { showToast } from "../../components/toast";
import { TrackRow } from "../../components/track-row";
import {
  CatState,
  PressScale,
  RIPPLE,
  Skeleton,
  SkeletonRows,
} from "../../components/ui";
import { yt } from "../../lib/engine";
import { haptic } from "../../lib/haptics";
import { rightClick } from "../../lib/context-menu";
import { autoplayMode } from "../../lib/settings";
import { display } from "../../lib/type";
import { MoreGlyph, PlayGlyph } from "../now-playing/icons";
import { ShuffleGlyph } from "../pages/collection";
import { itemKind, itemSub, itemTitle } from "./search-data";

const DIM = "rgba(255,255,255,0.4)";
const Stroke = {
  fill: "none",
  stroke: DIM,
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The small header over a group of results, with a way into the whole list. */
export function SectionHead({
  title,
  accent,
  onMore,
}: {
  title: string;
  accent: string;
  onMore?: () => void;
}) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} numberOfLines={1}>
        {title}
      </Text>
      {onMore ? (
        <Pressable hitSlop={10} onPress={onMore}>
          <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A suggestion or a past search: tap searches, the arrow fills the field, × forgets a past search. */
export function QueryRow({
  text,
  recent,
  onPick,
  onFill,
}: {
  text: string;
  recent?: boolean;
  onPick: (q: string) => void;
  onFill: (q: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPick(text)}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.query,
        pressed && !RIPPLE && styles.pressed,
      ]}
    >
      <View style={styles.lead}>
        <Svg width={18} height={18} viewBox="0 0 24 24" {...Stroke}>
          {recent ? (
            <>
              <Circle cx="12" cy="12" r="8.5" />
              <Path d="M12 7.5V12l3 2" />
            </>
          ) : (
            <>
              <Circle cx="11" cy="11" r="7" />
              <Path d="M20 20l-3.5-3.5" />
            </>
          )}
        </Svg>
      </View>
      <Text style={styles.queryText} numberOfLines={1}>
        {text}
      </Text>
      <FillArrow text={text} onFill={onFill} />
    </Pressable>
  );
}

function FillArrow({
  text,
  onFill,
}: {
  text: string;
  onFill: (q: string) => void;
}) {
  return (
    <Pressable
      hitSlop={6}
      accessibilityLabel={`Search for ${text}…`}
      onPress={() => onFill(text)}
      style={styles.action}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" {...Stroke}>
        <Path d="M18 18L7 7M7 15V7h8" />
      </Svg>
    </Pressable>
  );
}

/** A past search with the picture of what it found: swipe or × to forget it. */
export function RecentRow({
  text,
  art,
  onPick,
  onFill,
  onRemove,
}: {
  text: string;
  art?: { url: string; kind: string; round?: boolean };
  onPick: (q: string) => void;
  onFill: (q: string) => void;
  onRemove: (q: string) => void;
}) {
  return (
    <SwipeRow
      left={{
        label: "Remove",
        color: "#E5484D",
        onCommit: () => onRemove(text),
      }}
    >
      <Pressable
        onPress={() => !swipedRecently() && onPick(text)}
        android_ripple={RIPPLE}
        style={({ pressed }) => [
          styles.query,
          styles.recent,
          pressed && !RIPPLE && styles.pressed,
        ]}
      >
        {art ? (
          <Artwork
            thumbnails={[{ url: art.url, width: 120, height: 120 }]}
            size={44}
            radius={8}
            round={art.round}
            seed={text}
          />
        ) : (
          <View style={styles.clock}>
            <Svg width={20} height={20} viewBox="0 0 24 24" {...Stroke}>
              <Circle cx="12" cy="12" r="8.5" />
              <Path d="M12 7.5V12l3 2" />
            </Svg>
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.queryText} numberOfLines={1}>
            {text}
          </Text>
          {art ? (
            <Text style={styles.sub} numberOfLines={1}>
              {art.kind}
            </Text>
          ) : null}
        </View>
        <Pressable
          hitSlop={6}
          accessibilityLabel={`Remove ${text} from recent searches`}
          onPress={() => onRemove(text)}
          style={styles.action}
        >
          <CloseGlyph size={14} weight={2.6} color={DIM} />
        </Pressable>
        <FillArrow text={text} onFill={onFill} />
      </Pressable>
    </SwipeRow>
  );
}

/** A song, artist or album YouTube Music suggests while you type: opens or plays straight away. */
export function EntityRow({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: () => void;
}) {
  const open = () => {
    haptic.tick();
    onOpen();
    openItem(item);
  };
  return (
    <Pressable
      onPress={open}
      onLongPress={() => showItemActions(item)}
      {...rightClick(() => showItemActions(item))}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.query,
        pressed && !RIPPLE && styles.pressed,
      ]}
    >
      <Artwork
        thumbnails={item.thumbnails}
        size={44}
        radius={8}
        round={item.type === "artist"}
      />
      <View style={styles.text}>
        <Text style={styles.queryText} numberOfLines={1}>
          {itemTitle(item)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {itemSub(item)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Albums, artists and playlists: the same picture, two-line title, subtitle and menu as a song. */
export const ItemRow = memo(function ItemRow({ item }: { item: CatalogItem }) {
  const menu = () => showItemActions(item);
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        openItem(item);
      }}
      onLongPress={menu}
      delayLongPress={300}
      {...rightClick(menu)}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.row,
        pressed && !RIPPLE && styles.pressed,
      ]}
    >
      <Artwork
        thumbnails={item.thumbnails}
        size={50}
        radius={7}
        round={item.type === "artist"}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {itemTitle(item)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {itemSub(item)}
        </Text>
      </View>
      <Pressable hitSlop={12} onPress={menu} style={styles.more}>
        <MoreGlyph size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </Pressable>
  );
});

/** A song row, with what it is and who it's by in the subtitle. */
export function SongRow({
  track,
  siblings,
}: {
  track: CatalogItem & { type: "track" };
  siblings: CatalogItem[];
}) {
  return (
    <TrackRow
      track={track as Track}
      subtitle={itemSub(track)}
      onPress={() => openItem(track, siblings)}
    />
  );
}

type Act = {
  label: string;
  icon: (c: string) => ReactNode;
  primary?: boolean;
  run: () => Promise<unknown> | void;
};

// An album or playlist plays from the top, in order or shuffled.
const playTracks =
  (item: CatalogItem & { type: "album" | "playlist" }, shuffle: boolean) =>
  async () => {
    const d = await (item.type === "album"
      ? yt.album(item.id)
      : yt.playlist(item.id));
    if (!d.tracks.length) throw new Error("empty");
    player.setShuffle(shuffle);
    await player.play(d.tracks, 0, {
      source: { type: item.type, id: item.id, title: item.title },
      endless: autoplayMode() === "always",
    });
  };

const radio = (seed: RadioSeed) => player.playRadio(seed);

function actionsFor(item: CatalogItem): Act[] {
  const play = (c: string) => <PlayGlyph size={16} color={c} />;
  const shuffle = (c: string) => <ShuffleGlyph color={c} />;
  switch (item.type) {
    case "track":
      return [
        {
          label: "Play",
          icon: play,
          primary: true,
          run: () => radio({ videoId: item.id, title: item.title }),
        },
        {
          label: "Play next",
          icon: (c) => <PlayNextGlyph size={18} color={c} />,
          run: () => {
            player.addNext(item as Track);
            showToast("Playing next");
          },
        },
      ];
    case "artist":
      return [
        {
          label: "Shuffle",
          icon: shuffle,
          primary: true,
          run: async () => {
            const a = await yt.artist(item.id);
            if (!a.shufflePlaylistId) throw new Error("no shuffle");
            await radio({ playlistId: a.shufflePlaylistId, title: a.name });
          },
        },
        {
          label: "Radio",
          icon: (c) => <RadioGlyph size={18} color={c} />,
          run: async () => {
            const a = await yt.artist(item.id);
            if (!a.radioPlaylistId) throw new Error("no radio");
            await radio({
              playlistId: a.radioPlaylistId,
              title: `${a.name} radio`,
            });
          },
        },
      ];
    default:
      return [
        {
          label: "Play",
          icon: play,
          primary: true,
          run: playTracks(item, false),
        },
        { label: "Shuffle", icon: shuffle, run: playTracks(item, true) },
      ];
  }
}

/** The best match as a big card: its picture, what it is, and the one or two things you'd do with it. */
export function TopResult({ item }: { item: CatalogItem }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = (a: Act) => {
    if (busy) return;
    haptic.light();
    setBusy(a.label);
    Promise.resolve(a.run())
      .catch(() => showToast("Couldn't start that. Try again", { bad: true }))
      .finally(() => setBusy(null));
  };
  const sub = itemSub(item).split(" · ").slice(1).join(" · ");
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.topWrap}>
      <PressScale
        onPress={() => openItem(item)}
        onLongPress={() => showItemActions(item)}
        {...rightClick(() => showItemActions(item))}
        style={styles.topCard}
      >
        <View style={styles.topHead}>
          <Artwork
            thumbnails={item.thumbnails}
            size={104}
            radius={14}
            round={item.type === "artist"}
          />
          <View style={styles.text}>
            <Text style={styles.topKind}>
              TOP RESULT · {itemKind(item).toUpperCase()}
            </Text>
            <Text style={styles.topTitle} numberOfLines={2}>
              {itemTitle(item)}
            </Text>
            {sub ? (
              <Text style={styles.topSub} numberOfLines={2}>
                {sub}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.topActions}>
          {actionsFor(item).map((a) => (
            <PressScale
              key={a.label}
              quiet
              onPress={() => go(a)}
              style={[
                styles.pill,
                a.primary ? styles.pillOn : styles.pillOff,
                !!busy && busy !== a.label && styles.dim,
              ]}
            >
              {a.icon(a.primary ? "#000" : "#fff")}
              <Text style={[styles.pillText, a.primary && { color: "#000" }]}>
                {a.label}
              </Text>
            </PressScale>
          ))}
        </View>
      </PressScale>
    </Animated.View>
  );
}

/** What the All tab looks like while it loads: the top card, then a list. */
export function ResultsSkeleton() {
  return (
    <View>
      <View style={styles.topWrap}>
        <View style={[styles.topCard, { height: 190 }]}>
          <View style={styles.topHead}>
            <Skeleton w={104} h={104} r={14} />
            <View style={styles.text}>
              <Skeleton w={90} h={10} />
              <Skeleton w="75%" h={20} style={{ marginTop: 10 }} />
              <Skeleton w="50%" h={12} style={{ marginTop: 10 }} />
            </View>
          </View>
        </View>
      </View>
      <SkeletonRows count={6} />
    </View>
  );
}

/** A search that failed: "offline" when the phone has no connection, and it tries again by itself when one returns. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const was = useRef(offline);
  const retry = useEffectEvent(onRetry);
  useEffect(() => {
    if (was.current && !offline) retry();
    was.current = offline;
  }, [offline]);
  return offline ? (
    <CatState
      kind="offline"
      message="Connect to the internet to search."
      action="Try again"
      onAction={onRetry}
    />
  ) : (
    <CatState
      kind="error"
      message="Search didn't go through."
      action="Try again"
      onAction={onRetry}
    />
  );
}

/** The end of a list that pages in: rows while the next page loads, or a way to try again. */
export function ListFoot({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (failed)
    return (
      <Pressable onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>
          Couldn’t load more. Tap to try again
        </Text>
      </Pressable>
    );
  return loading ? <SkeletonRows count={3} /> : null;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 26,
    marginBottom: 6,
  },
  headTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 22,
    ...display("800"),
    letterSpacing: -0.4,
  },
  seeAll: { fontSize: 15, fontWeight: "600" },
  query: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  recent: { paddingVertical: 6 },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  lead: { width: 24, alignItems: "center" },
  clock: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  queryText: { flex: 1, color: "#fff", fontSize: 16.5 },
  action: {
    width: 34,
    height: 34,
    marginRight: -8,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  topWrap: { paddingHorizontal: 16, marginTop: 12 },
  topCard: {
    padding: 14,
    gap: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  topKind: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11.5,
    ...display("700"),
    letterSpacing: 0.6,
  },
  topTitle: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 26,
    ...display("800"),
    letterSpacing: -0.3,
    marginTop: 4,
  },
  topSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 3 },
  topActions: { flexDirection: "row", gap: 10 },
  pill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pillOn: { backgroundColor: "#fff" },
  pillOff: { backgroundColor: "rgba(255,255,255,0.12)" },
  pillText: { color: "#fff", fontSize: 15, ...display("700") },
  dim: { opacity: 0.5 },
  retry: { alignItems: "center", paddingVertical: 20 },
  retryText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
});
