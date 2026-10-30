import {
  bestThumbnail,
  type CommentPage,
  type VideoComment,
  type VideoDetail,
} from "@pawse/music-core";
import { Image } from "expo-image";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { CloseGlyph } from "../../components/glyphs";
import { showToast } from "../../components/toast";
import { PressScale, Skeleton } from "../../components/ui";
import { clock, openChannel } from "../../components/video-card";
import { ytv } from "../../lib/engine";
import { useFocus } from "../../lib/focus";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";

/** The first page of a video's comments, shared by the card and the panel. */
export const useComments = (id: string, token?: string) =>
  useResource<CommentPage>(token ? `comments:${id}` : null, () =>
    ytv.comments(token!),
  );

/** YouTube's comments teaser under the buttons: the count and the top comment. */
export function CommentsCard({
  page,
  failed,
  onPress,
  onRetry,
}: {
  page?: CommentPage;
  failed?: boolean;
  onPress: () => void;
  onRetry: () => void;
}) {
  const top = page?.items[0];
  return (
    <PressScale onPress={failed ? onRetry : onPress} style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          Comments{" "}
          {page?.count ? <Text style={styles.count}>{page.count}</Text> : null}
        </Text>
        <ChevronsUpDown
          size={16}
          color="rgba(255,255,255,0.7)"
          strokeWidth={2}
        />
      </View>
      {top ? (
        <View style={styles.cardRow}>
          <Avatar uri={top.author.avatar} size={24} />
          <Text style={styles.cardText} numberOfLines={2}>
            {top.text}
          </Text>
        </View>
      ) : failed ? (
        <Text style={styles.failed}>Couldn’t load them. Tap to try again.</Text>
      ) : page ? (
        <Text style={styles.failed}>No comments yet.</Text>
      ) : (
        <Skeleton w="80%" h={12} r={5} style={{ marginTop: 10 }} />
      )}
    </PressScale>
  );
}

/** A sheet over the page below the video, like YouTube's: the video keeps playing above it. */
export function Panel({
  title,
  count,
  onClose,
  children,
}: {
  title: string;
  count?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Drag the top of the sheet down to close it, like YouTube's; it slides away either way.
  const dy = useSharedValue(0);
  const tall = useSharedValue(800);
  const pull = useMemo(() => {
    const away = (v = 0) => {
      "worklet";
      dy.set(
        withTiming(tall.value, { duration: v > 1500 ? 160 : 220 }, (done) => {
          if (done) scheduleOnRN(onClose);
        }),
      );
    };
    return {
      away,
      pan: Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-20, 20])
        .onUpdate((e) => dy.set(Math.max(0, e.translationY)))
        .onEnd((e) => {
          if (e.translationY > 90 || e.velocityY > 700) away(e.velocityY);
          else dy.set(withSpring(0, { damping: 24, stiffness: 260 }));
        }),
    };
  }, [dy, tall, onClose]);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }],
  }));
  return (
    <Animated.View
      entering={SlideInDown.duration(260)}
      style={styles.panel}
      onLayout={(e) => tall.set(e.nativeEvent.layout.height)}
    >
      <Animated.View style={[styles.fill, slide]}>
        <GestureDetector gesture={pull.pan}>
          <View style={styles.panelTop} collapsable={false}>
            <View style={styles.grab} />
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {title}{" "}
                {count ? <Text style={styles.count}>{count}</Text> : null}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={() => pull.away()}
                style={styles.close}
                accessibilityLabel="Close"
              >
                <CloseGlyph size={12} weight={3} color="#fff" />
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export function CommentsPanel({
  first,
  failed,
  onRetry,
  onClose,
  onSeek,
}: {
  first?: CommentPage;
  failed?: boolean;
  onRetry: () => void;
  onClose: () => void;
  onSeek: (sec: number) => void;
}) {
  const [more, setMore] = useState<{ items: VideoComment[]; next?: string }>();
  const [busy, setBusy] = useState(false);
  const items = [...(first?.items ?? []), ...(more?.items ?? [])];
  const next = more ? more.next : first?.continuation;
  const load = () => {
    if (busy || !next) return;
    setBusy(true);
    ytv
      .comments(next)
      .then((p) =>
        setMore({
          items: [...(more?.items ?? []), ...p.items],
          next: p.continuation,
        }),
      )
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <Panel title="Comments" count={first?.count} onClose={onClose}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <Comment c={item} onSeek={onSeek} />}
        onEndReached={load}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 60 }}
        ListEmptyComponent={
          first ? (
            <Text style={styles.empty}>No comments yet.</Text>
          ) : failed ? (
            <Pressable onPress={onRetry} style={styles.retry}>
              <Text style={styles.failed}>
                Couldn’t load comments. Tap to try again.
              </Text>
            </Pressable>
          ) : (
            <CommentSkeleton />
          )
        }
        ListFooterComponent={busy ? <CommentSkeleton n={2} /> : null}
      />
    </Panel>
  );
}

// "1:23" or "1:02:03" in a comment jumps the video there, like on YouTube; a web link opens in the browser.
const TOKEN = /(https?:\/\/[^\s<>"]+)|\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;

const openLink = (url: string) =>
  Linking.openURL(url).catch(() =>
    showToast("Couldn’t open that link", { bad: true }),
  );

/** The text with its links and timestamps pressable. */
function linked(text: string, onSeek: (sec: number) => void) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    // A sentence's full stop or bracket isn't part of the link.
    const url = m[1]?.replace(/[.,;:!?)\]'"]+$/, "");
    const len = url ? url.length : m[0].length;
    if (at > last) parts.push(text.slice(last, at));
    if (url) {
      parts.push(
        <Text key={at} style={styles.stamp} onPress={() => openLink(url)}>
          {url}
        </Text>,
      );
    } else {
      const sec = Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
      parts.push(
        <Text key={at} style={styles.stamp} onPress={() => onSeek(sec)}>
          {m[0]}
        </Text>,
      );
    }
    last = at + len;
  }
  parts.push(text.slice(last));
  return parts;
}

function CommentText({
  text,
  onSeek,
  full,
}: {
  text: string;
  onSeek: (sec: number) => void;
  /** Never shortened (the description). */
  full?: boolean;
}) {
  const [open, setOpen] = useState(!!full);
  return (
    <Text
      style={styles.text}
      numberOfLines={open ? undefined : 5}
      onPress={() => setOpen(!open)}
    >
      {linked(text, onSeek)}
    </Text>
  );
}

function Comment({
  c,
  onSeek,
}: {
  c: VideoComment;
  onSeek: (sec: number) => void;
}) {
  const [replies, setReplies] = useState<{
    items: VideoComment[];
    next?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const loadReplies = (token?: string) => {
    if (busy || !token) return;
    setBusy(true);
    ytv
      .comments(token)
      .then((p) =>
        setReplies({
          items: [...(replies?.items ?? []), ...p.items],
          next: p.continuation,
        }),
      )
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <View style={[styles.comment, c.reply && styles.reply]}>
      <Avatar uri={c.author.avatar} size={c.reply ? 24 : 32} />
      <View style={{ flex: 1 }}>
        <Text style={styles.by} numberOfLines={1}>
          <Text style={c.author.creator ? styles.creator : undefined}>
            {c.author.name}
          </Text>
          {c.published ? ` · ${c.published}` : ""}
          {c.pinned ? " · Pinned" : ""}
        </Text>
        <CommentText text={c.text} onSeek={onSeek} />
        <View style={styles.bar}>
          <ThumbGlyph />
          {c.likes ? <Text style={styles.barText}>{c.likes}</Text> : null}
          {c.hearted ? <Text style={styles.heart}>♥</Text> : null}
        </View>
        {c.repliesToken && !replies ? (
          <Pressable onPress={() => loadReplies(c.repliesToken)} hitSlop={6}>
            <Text style={styles.replies}>
              {busy
                ? "Loading…"
                : `${c.replies ?? ""} ${c.replies === "1" ? "reply" : "replies"}`}
            </Text>
          </Pressable>
        ) : null}
        {replies?.items.map((r) => (
          <Comment key={r.id} c={r} onSeek={onSeek} />
        ))}
        {replies?.next ? (
          <Pressable onPress={() => loadReplies(replies.next)} hitSlop={6}>
            <Text style={styles.replies}>
              {busy ? "Loading…" : "Show more replies"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** The description collapsed under the buttons, like YouTube's: views and age, the first lines, tap for the sheet. */
export function DescriptionCard({
  detail,
  onPress,
  onSeek,
}: {
  detail: VideoDetail;
  onPress: () => void;
  onSeek: (sec: number) => void;
}) {
  const focus = useFocus();
  const v = detail.video;
  const meta = [focus.counts ? v.viewsText : undefined, v.publishedText]
    .filter(Boolean)
    .join(" · ");
  if (!meta && !detail.description) return null;
  return (
    <PressScale onPress={onPress} style={styles.card} scaleTo={0.98}>
      {meta ? <Text style={styles.cardTitle}>{meta}</Text> : null}
      {detail.description ? (
        <>
          <Text style={styles.descPreview} numberOfLines={3}>
            {linked(detail.description, onSeek)}
          </Text>
          <Text style={styles.cardMore}>…more</Text>
        </>
      ) : null}
    </PressScale>
  );
}

/** The full description: counts up top, then the text and the chapters. */
export function DescriptionPanel({
  detail,
  title,
  likes,
  onClose,
  onSeek,
}: {
  detail: VideoDetail;
  title?: string;
  likes?: number;
  onClose: () => void;
  onSeek: (sec: number) => void;
}) {
  const v = detail.video;
  const focus = useFocus();
  const avatar = v.channel?.avatar && bestThumbnail(v.channel.avatar, 88);
  const stats = [
    likes !== undefined ? [short(likes), "Likes"] : null,
    focus.counts && v.viewsText ? splitStat(v.viewsText) : null,
    v.publishedText ? [v.publishedText, ""] : null,
  ].filter(Boolean) as string[][];
  return (
    <Panel title="Description" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.descBody}>
        <Text style={styles.descTitle}>{title ?? v.title}</Text>
        {v.channel ? (
          <Pressable
            onPress={() => v.channel?.id && openChannel(v.channel.id)}
            style={styles.descChannel}
          >
            {avatar ? <Avatar uri={avatar} size={28} /> : null}
            <Text style={styles.descChannelName} numberOfLines={1}>
              {v.channel.name}
            </Text>
            {detail.subscribersText && focus.counts ? (
              <Text style={styles.descSubs} numberOfLines={1}>
                {detail.subscribersText}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
        <View style={styles.stats}>
          {stats.map(([a, b]) => (
            <View key={a} style={styles.stat}>
              <Text style={styles.statBig} numberOfLines={1}>
                {a}
              </Text>
              {b ? <Text style={styles.statSmall}>{b}</Text> : null}
            </View>
          ))}
        </View>
        <View style={styles.descBox}>
          {detail.description ? (
            <CommentText text={detail.description} onSeek={onSeek} full />
          ) : (
            <Text style={styles.failed}>No description.</Text>
          )}
        </View>
        {detail.chapters.length ? (
          <>
            <Text style={styles.descHead}>
              Chapters{detail.chapters[0].ai ? " · AI" : ""}
            </Text>
            {detail.chapters.map((c, i) => (
              <Pressable
                key={`${c.startSec}${i}`}
                onPress={() => onSeek(c.startSec)}
                style={styles.chapter}
              >
                <Text style={styles.chapterTime}>
                  {clock(c.startSec) || "0:00"}
                </Text>
                <Text style={styles.chapterTitle} numberOfLines={2}>
                  {c.title}
                </Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Panel>
  );
}

// "1,087,902 views" → ["1,087,902", "Views"].
const splitStat = (s: string) => {
  const m = s.match(/^([\d.,]+[KMB]?)\s+(.*)$/i);
  return m ? [m[1], m[2][0].toUpperCase() + m[2].slice(1)] : [s, ""];
};

export const short = (n: number) =>
  n >= 1e9
    ? `${trim(n / 1e9)}B`
    : n >= 1e6
      ? `${trim(n / 1e6)}M`
      : n >= 1e3
        ? `${trim(n / 1e3)}K`
        : String(n);
const trim = (x: number) =>
  (x >= 100 ? Math.round(x) : x.toFixed(1)).toString().replace(/\.0$/, "");

function Avatar({ uri, size }: { uri?: string; size: number }) {
  return (
    <Image
      source={uri}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#222",
      }}
    />
  );
}

function CommentSkeleton({ n = 5 }: { n?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={styles.comment}>
          <Skeleton w={32} h={32} r={16} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton w="40%" h={10} r={4} />
            <Skeleton w="90%" h={12} r={5} />
            <Skeleton w="70%" h={12} r={5} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const ThumbGlyph = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"
      stroke="rgba(255,255,255,0.7)"
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { color: "#fff", fontSize: 15, ...display("800") },
  cardMore: {
    color: "#fff",
    fontSize: 13.5,
    marginTop: 4,
    alignSelf: "flex-end",
    ...display("700"),
  },
  descPreview: {
    color: "#fff",
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 8,
  },
  count: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "500" },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  cardText: { flex: 1, color: "#fff", fontSize: 13.5, lineHeight: 18 },
  failed: { color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginTop: 8 },
  retry: { padding: 16 },
  empty: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    padding: 32,
  },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fill: {
    flex: 1,
    backgroundColor: "#0f0f0f",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: "hidden",
  },
  panelTop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  grab: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 44,
  },
  panelTitle: { color: "#fff", fontSize: 17, ...display("800") },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  comment: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  reply: { paddingHorizontal: 0 },
  by: { color: "rgba(255,255,255,0.55)", fontSize: 12.5 },
  creator: { color: "#fff", fontWeight: "700" },
  text: { color: "#fff", fontSize: 14, lineHeight: 20, marginTop: 3 },
  stamp: { color: "#3EA6FF" },
  bar: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  barText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  heart: { color: "#FF4E6A", fontSize: 13, marginLeft: 8 },
  replies: {
    color: "#3EA6FF",
    fontSize: 13.5,
    marginTop: 10,
    ...display("700"),
  },
  descBody: { padding: 16, paddingBottom: 60 },
  descTitle: { color: "#fff", fontSize: 18, lineHeight: 23, ...display("800") },
  descChannel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  descChannelName: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 14.5,
    ...display("700"),
  },
  descSubs: { color: "rgba(255,255,255,0.55)", fontSize: 12.5 },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 18,
    paddingVertical: 4,
  },
  stat: { alignItems: "center", flex: 1 },
  statBig: { color: "#fff", fontSize: 17, ...display("800") },
  statSmall: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  descBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  descHead: {
    color: "#fff",
    fontSize: 16,
    marginTop: 22,
    marginBottom: 6,
    ...display("800"),
  },
  chapter: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  chapterTime: {
    color: "#3EA6FF",
    fontSize: 13.5,
    width: 56,
    ...display("700"),
  },
  chapterTitle: { flex: 1, color: "#fff", fontSize: 14 },
});
