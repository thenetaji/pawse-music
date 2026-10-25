import {
  bestThumbnail,
  type Track,
  type VideoDetail,
  type VideoItem,
} from "@pawse/music-core";
import { player, usePlayerStore } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { CatState, PressScale, SectionTitle } from "../../components/ui";
import {
  clock,
  openChannel,
  VideoRow,
  videoMeta,
} from "../../components/video-card";
import { ytv } from "../../lib/engine";
import { logEvent } from "../../lib/diagnostics";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import {
  type Quality,
  type VideoSource,
  videoSource,
} from "../../lib/video-stream";
import { showSheet } from "../../components/action-sheet";
import { compact, useVotes } from "../../lib/dislikes";
import { showToast } from "../../components/toast";
import { useVideoFilter } from "../../lib/block";
import { skipNote, useBranding, videoSkips } from "../../lib/community";
import type { SkipSegment } from "@pawse/innertube";
import { type VideoHandle, VideoPlayer } from "../video/video-player";

const MAX_W = 980;
// Room above the page for a pull-down bounce, so the glow never shows a gap.
const OVERSCROLL = 600;

/** One video: the player glowing with its own picture on black, then chapters, the description and what's next. */
export default function VideoPage() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pref = useSetting("videoPreferred", "auto");
  const autoplay = useSetting("videoAutoplay", false);
  const w = Math.min(width, MAX_W);
  const detail = useResource<VideoDetail>(`video:${id}`, () => ytv.video(id));
  // A quality picked on this page, keyed by video; otherwise the default from Settings.
  const [picked, setPicked] = useState<{ id: string; q: Quality }>();
  const quality: Quality =
    picked?.id === id ? picked.q : typeof pref === "number" ? pref : "auto";
  // Keyed by video, so moving to another video starts clean without resetting in an effect.
  const [loaded, setLoaded] = useState<{
    id: string;
    src?: VideoSource;
    error?: string;
    /** Where playback picks up: the link's ?t= at first, the current spot after a quality switch. */
    start?: number;
  }>();
  const [endedKey, setEndedKey] = useState<string | null>(null);
  const src = loaded?.id === id ? loaded.src : undefined;
  const error = loaded?.id === id ? loaded.error : undefined;
  const ended = endedKey === id;
  const setError = (message: string) => {
    logEvent("video-failed", `${id}: ${message}`);
    setLoaded({ id, error: message });
  };
  const setEnded = (on: boolean) => setEndedKey(on ? id : null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  const [track, setTrack] = useState<{ id: string; label: string }>();
  const handle = useRef<VideoHandle>(null);
  const skips = useRef<SkipSegment[]>([]);
  const keep = useVideoFilter();
  const brand = useBranding(id);

  useEffect(() => {
    skips.current = [];
    let live = true;
    void videoSkips(id).then((s) => {
      if (live) skips.current = s;
    });
    return () => {
      live = false;
    };
  }, [id]);

  // Sponsor reads and plugs are jumped over as playback reaches them.
  const onTime = (sec: number) => {
    setAt(sec);
    atRef.current = sec;
    const seg = skips.current.find((g) => sec >= g.start && sec < g.end - 0.5);
    if (!seg) return;
    handle.current?.seek(seg.end);
    showToast(skipNote(seg.category));
  };

  // A video takes over from the music, the way another app's video would.
  useEffect(() => {
    const st = usePlayerStore.getState().status;
    if (st === "playing" || st === "buffering" || st === "loading")
      player.pause();
  }, []);

  // The old quality keeps playing until the new one is ready, then it carries on from the same moment.
  useEffect(() => {
    let live = true;
    videoSource(id, quality)
      .then(
        (s) =>
          live &&
          setLoaded((was) => ({
            id,
            src: s,
            start:
              was?.id === id && was.src
                ? atRef.current
                : t
                  ? Number(t)
                  : undefined,
          })),
      )
      .catch((e: Error) => {
        logEvent("video-failed", `${id}: ${e.message}`);
        if (live) setLoaded({ id, error: e.message });
      });
    return () => {
      live = false;
    };
    // t only matters for the first load of a video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, quality]);

  const playing = track?.id === id ? track.label : undefined;
  const qualityLabel =
    src?.quality === "auto"
      ? playing
        ? `Auto · ${playing}`
        : "Auto"
      : (src?.quality ?? "Quality");
  const pickQuality = () => {
    if (!src) return;
    const choose = (q: Quality) => () => setPicked({ id, q });
    showSheet({
      header: <Text style={styles.sheetTitle}>Quality</Text>,
      actions: [
        {
          label: src.quality === "auto" ? `✓  ${qualityLabel}` : "Auto",
          sub: "Changes with your connection",
          onPress: choose("auto"),
        },
        ...src.options.map((o) => ({
          label: src.quality === o.key ? `✓  ${o.key}` : o.key,
          onPress: choose(o.key),
        })),
      ],
    });
  };
  const share = () => {
    haptic.light();
    void Share.share({
      url: `https://youtu.be/${id}`,
      message: `https://youtu.be/${id}`,
    });
  };

  const d = detail.data;
  const v = d?.video;
  const thumb = v ? bestThumbnail(v.thumbnails, 480) : undefined;
  // The glow follows the playing picture where a player can share frames, else the thumbnail.
  const [frame, setFrame] = useState<{ id: string; uri: string }>();
  const glow =
    frame?.id === id ? frame.uri : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const stageH = (w * 9) / 16;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.back();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const related = d?.related.filter(keep) ?? [];
  const next = related[0];

  const onEnd = () => {
    if (autoplay && next) return router.replace(`/video/${next.id}`);
    setEnded(true);
  };

  const listen = () => {
    if (!v) return;
    haptic.light();
    const track: Track = {
      id: v.id,
      source: "youtube",
      title: v.title,
      artists: [{ id: v.channel?.id, name: v.channel?.name ?? "YouTube" }],
      durationSec: src?.stream.durationSec ?? v.durationSec,
      thumbnails: v.thumbnails,
      kind: "video",
    };
    router.back();
    void player.play([track], 0, {
      source: { type: "other", title: "From Watch" },
    });
  };

  const chapter = d?.chapters.reduce<number>(
    (cur, c, i) => (c.startSec <= at ? i : cur),
    -1,
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          alignItems: "center",
        }}
      >
        <Ambient uri={glow} height={insets.top + stageH + 220} />
        <View style={{ width: w }}>
          {/* Full width like YouTube: a swipe down, back or Esc closes it. */}
          <View
            style={[styles.stage, { height: stageH, marginTop: insets.top }]}
          >
            {src ? (
              <VideoPlayer
                ref={handle}
                uri={src.uri}
                headers={src.stream.headers}
                poster={thumb}
                style={StyleSheet.absoluteFill}
                onEnd={onEnd}
                onTime={onTime}
                startAt={loaded?.start}
                onError={setError}
                onFrame={(uri) => setFrame({ id, uri })}
                onTrack={(h, fps) =>
                  setTrack({
                    id,
                    label: `${h}p${(fps ?? 30) > 30 ? "60" : ""}`,
                  })
                }
              />
            ) : thumb ? (
              <Image
                source={thumb}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={error ? 12 : 0}
              />
            ) : null}
            {!src ? (
              <View style={styles.veil}>
                <Text style={styles.veilText}>
                  {error ? "This video won't play right now." : "Loading…"}
                </Text>
              </View>
            ) : null}
            {ended ? (
              <EndCard
                next={next}
                onReplay={() => {
                  setEnded(false);
                  handle.current?.replay();
                }}
                onNext={() => next && router.replace(`/video/${next.id}`)}
                onDone={() => router.back()}
              />
            ) : null}
          </View>

          {v ? (
            <Animated.View entering={FadeInDown.duration(360)}>
              <Text style={styles.title}>{brand?.title ?? v.title}</Text>
              <Text style={styles.meta}>{videoMeta(v, false)}</Text>
              <View style={styles.channel}>
                <Pressable
                  onPress={() => {
                    const cid = v.channel?.id;
                    if (!cid) return;
                    router.back();
                    setTimeout(() => openChannel(cid), 250);
                  }}
                  style={styles.channelHit}
                >
                  {v.channel?.avatar ? (
                    <Image
                      source={bestThumbnail(v.channel.avatar, 88)}
                      style={styles.avatar}
                    />
                  ) : null}
                  <Text style={styles.channelName} numberOfLines={1}>
                    {v.channel?.name}
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actions}
              >
                <VoteBar id={id} />
                <Pill
                  icon={<GearGlyph />}
                  label={qualityLabel}
                  onPress={pickQuality}
                />
                <Pill
                  icon={<HeadphonesGlyph />}
                  label="Listen"
                  onPress={listen}
                />
                <Pill icon={<ShareGlyph />} label="Share" onPress={share} />
              </ScrollView>
            </Animated.View>
          ) : detail.error ? (
            <CatState
              kind="error"
              message="Couldn't open this video."
              action="Try again"
              onAction={detail.reload}
            />
          ) : null}

          {d?.chapters.length ? (
            <View>
              <SectionTitle title="Chapters" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chapters}
              >
                {d.chapters.map((c, i) => (
                  <PressScale
                    key={`${c.startSec}${i}`}
                    onPress={() => handle.current?.seek(c.startSec)}
                    style={[styles.chapter, i === chapter && styles.chapterOn]}
                  >
                    <Text style={styles.chapterTime}>
                      {clock(c.startSec) || "0:00"}
                    </Text>
                    <Text style={styles.chapterTitle} numberOfLines={2}>
                      {c.title}
                    </Text>
                  </PressScale>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {d?.description ? (
            <Pressable onPress={() => setOpen(!open)} style={styles.desc}>
              <Text
                style={styles.descText}
                numberOfLines={open ? undefined : 3}
              >
                {d.description}
              </Text>
              <Text style={styles.more}>{open ? "Less" : "More"}</Text>
            </Pressable>
          ) : null}

          {related.length ? (
            <View>
              <SectionTitle title="Up next" />
              {related.slice(0, 12).map((r) => (
                <VideoRow
                  key={r.id}
                  video={r}
                  onPress={() => router.replace(`/video/${r.id}`)}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Pill({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={styles.pill}>
      {icon}
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

const GearGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 7h10M18 7h2M4 17h4M12 17h8"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <Path
      d="M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
      stroke="#fff"
      strokeWidth={2}
    />
  </Svg>
);

const ShareGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14 5l7 7-7 7M21 12H10a6 6 0 0 0-6 6v1"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Likes beside Return YouTube Dislike's estimate, with a thin bar of the share that liked it.
function VoteBar({ id }: { id: string }) {
  const v = useVotes(id);
  if (!v) return null;
  const share = v.likes + v.dislikes ? v.likes / (v.likes + v.dislikes) : 1;
  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      style={[styles.pill, styles.votes]}
    >
      <Thumb up />
      <Text style={styles.voteText}>{compact(v.likes)}</Text>
      <Thumb />
      <Text style={styles.voteText}>{compact(v.dislikes)}</Text>
      <View style={styles.voteTrack}>
        <View style={[styles.voteFill, { width: `${share * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

const Thumb = ({ up }: { up?: boolean }) => (
  <Svg
    width={15}
    height={15}
    viewBox="0 0 24 24"
    fill="none"
    style={up ? undefined : { transform: [{ rotate: "180deg" }] }}
  >
    <Path
      d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"
      stroke="rgba(255,255,255,0.75)"
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

// When a video ends nothing starts by itself: replay, go on, or stop here.
function EndCard({
  next,
  onReplay,
  onNext,
  onDone,
}: {
  next?: VideoItem;
  onReplay: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.end}>
      <View style={styles.endRow}>
        <PressScale onPress={onReplay} style={styles.endBtn}>
          <Text style={styles.endText}>Replay</Text>
        </PressScale>
        {next ? (
          <PressScale onPress={onNext} style={styles.endBtn}>
            <Text style={styles.endText}>Next</Text>
          </PressScale>
        ) : null}
        <PressScale onPress={onDone} style={[styles.endBtn, styles.endDone]}>
          <Text style={[styles.endText, { color: "#000" }]}>Done</Text>
        </PressScale>
      </View>
      {next ? (
        <Text style={styles.endNext} numberOfLines={1}>
          Next: {next.title}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const HeadphonesGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** YouTube's ambient mode: the picture, blurred past recognition, lighting the black around the player. */
function Ambient({ uri, height }: { uri: string; height: number }) {
  const total = height + OVERSCROLL;
  return (
    <View
      pointerEvents="none"
      style={[styles.ambient, { top: -OVERSCROLL, height: total }]}
    >
      <Image
        source={uri}
        style={styles.ambientImage}
        contentFit="cover"
        blurRadius={48}
        transition={1400}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "#000"]}
        locations={[0, (OVERSCROLL + height * 0.55) / total, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  ambient: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  // Scaled past the edges so the blur doesn't fade to dark at the sides.
  ambientImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.85,
    transform: [{ scale: 1.35 }],
  },
  stage: { backgroundColor: "#000", overflow: "hidden" },
  sheetTitle: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 4,
    ...display("800"),
  },
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  veilText: { color: "#fff", fontSize: 14, ...display("700") },
  title: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 25,
    marginTop: 16,
    marginHorizontal: 16,
    ...display("800"),
  },
  meta: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13.5,
    marginTop: 5,
    marginHorizontal: 16,
  },
  actions: { gap: 8, paddingHorizontal: 16, marginTop: 14 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pillText: { color: "#fff", fontSize: 14, ...display("700") },
  votes: { gap: 6 },
  voteText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginRight: 8,
    ...display("700"),
  },
  voteTrack: {
    width: 44,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  voteFill: { height: 3, backgroundColor: "rgba(255,255,255,0.75)" },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    marginHorizontal: 16,
  },
  channelHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#222" },
  channelName: { flex: 1, color: "#fff", fontSize: 15.5, ...display("700") },
  chapters: { gap: 10, paddingHorizontal: 16 },
  chapter: {
    width: 150,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chapterOn: { backgroundColor: "rgba(255,255,255,0.2)" },
  chapterTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    ...display("700"),
  },
  chapterTitle: {
    color: "#fff",
    fontSize: 13.5,
    marginTop: 4,
    ...display("700"),
  },
  desc: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  descText: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20 },
  more: { color: "#fff", fontSize: 13, marginTop: 6, ...display("800") },
  end: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  endRow: { flexDirection: "row", gap: 10 },
  endBtn: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  endDone: { backgroundColor: "#fff" },
  endText: { color: "#fff", fontSize: 14, ...display("800") },
  endNext: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12.5,
    maxWidth: "80%",
  },
});
