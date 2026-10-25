import {
  artistLine,
  bestThumbnail,
  type Thumbnail,
  type Track,
  type VideoFeed,
  type VideoItem,
} from "@pawse/music-core";
import { player, usePlayerSelect } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { Artwork } from "../../components/artwork";
import { PressScale, SectionTitle, SkeletonShelves } from "../../components/ui";
import { VideoCard } from "../../components/video-card";
import { useLibrary } from "../../data/library";
import { isUnfinished, useWatched, type Watched } from "../../data/watched";
import { useVideoFilter } from "../../lib/block";
import { ytv } from "../../lib/engine";
import { go, push } from "../../lib/nav";
import { autoplayMode } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { openWatch, useWatch } from "../watch/store";

// Same keys as the videos page, so both share one copy of each feed.
export const useSubsFeed = (on: boolean) =>
  useResource<VideoFeed>(on ? "watch:subs" : null, () => ytv.subscriptions(), {
    keep: true,
  });
const useVideoHome = (on: boolean) =>
  useResource<VideoFeed>(on ? "watch:home" : null, () => ytv.home(), {
    keep: true,
  });

// "3 hours ago", "Streamed 2 days ago": new enough for a dot.
const FRESH = /\b(\d+ (second|minute|hour)s?|1 day|2 days) ago/i;

/** The one thing you were in the middle of: a video partway through or the last song, whichever is newer. */
export function ContinueCard({ accent }: { accent: string }) {
  const watched = useWatched((s) => s.list);
  const open = useWatch((s) => s.id);
  const current = usePlayerSelect((s) => s.current?.id);
  const last = useLibrary((s) => s.history[0]);
  const videos = watched.filter((w) => isUnfinished(w) && w.id !== open);
  const video = videos[0];
  // A loaded song already sits in the mini player, so it isn't offered twice.
  const song = last && last.track.id !== current ? last : undefined;
  if (!video && !song) return null;
  const showVideo = !!video && (!song || video.at >= song.at);
  return (
    <Animated.View entering={FadeInDown.duration(380)}>
      <SectionTitle title="Continue" />
      {showVideo ? (
        <VideoHero w={video} accent={accent} />
      ) : (
        <SongHero track={song!.track} accent={accent} />
      )}
      {videos.length > (showVideo ? 1 : 0) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.minis}
        >
          {videos.slice(showVideo ? 1 : 0, 8).map((w) => (
            <PressScale
              key={w.id}
              onPress={() => resume(w)}
              style={styles.mini}
            >
              <View style={styles.miniPic}>
                <Pic
                  thumbnails={w.thumbnails}
                  style={StyleSheet.absoluteFill}
                />
                <Progress w={w} accent={accent} />
              </View>
              <Text style={styles.miniTitle} numberOfLines={2}>
                {w.title}
              </Text>
            </PressScale>
          ))}
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}

const resume = (w: Watched) =>
  openWatch({
    id: w.id,
    title: w.title,
    thumbnails: w.thumbnails,
    channel: w.channel,
  });

function VideoHero({ w, accent }: { w: Watched; accent: string }) {
  const left = w.dur ? Math.max(1, Math.round((w.dur - w.pos) / 60)) : 0;
  return (
    <PressScale onPress={() => resume(w)} style={styles.hero}>
      <Pic thumbnails={w.thumbnails} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.9)"]}
        locations={[0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroText}>
        <Text style={styles.heroKicker}>
          {left ? `${left} min left` : "Keep watching"}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {w.title}
        </Text>
        {w.channel?.name ? (
          <Text style={styles.heroSub} numberOfLines={1}>
            {w.channel.name}
          </Text>
        ) : null}
      </View>
      <PlayBadge accent={accent} />
      <Progress w={w} accent={accent} />
    </PressScale>
  );
}

function SongHero({ track, accent }: { track: Track; accent: string }) {
  return (
    <PressScale
      onPress={() =>
        void player.play([track], 0, {
          radio: autoplayMode() !== "off",
          source: { type: "library", title: "Recently played" },
        })
      }
      style={[styles.hero, styles.songHero]}
    >
      <Pic thumbnails={track.thumbnails} style={StyleSheet.absoluteFill} blur />
      <View style={[StyleSheet.absoluteFill, styles.songDim]} />
      <Artwork thumbnails={track.thumbnails} size={112} radius={12} />
      <View style={{ flex: 1 }}>
        <Text style={styles.heroKicker}>Keep listening</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {track.title}
        </Text>
        <Text style={styles.heroSub} numberOfLines={1}>
          {artistLine(track.artists)}
        </Text>
      </View>
      <PlayBadge accent={accent} />
    </PressScale>
  );
}

function Pic({
  thumbnails,
  style,
  blur,
}: {
  thumbnails: Thumbnail[];
  style: object;
  blur?: boolean;
}) {
  return (
    <Image
      source={bestThumbnail(thumbnails, blur ? 120 : 720)}
      style={style}
      contentFit="cover"
      blurRadius={blur ? 30 : undefined}
      transition={200}
    />
  );
}

function Progress({ w, accent }: { w: Watched; accent: string }) {
  if (!w.dur) return null;
  return (
    <View style={styles.track}>
      <View
        style={{
          width: `${Math.min(100, (w.pos / w.dur) * 100)}%`,
          height: "100%",
          backgroundColor: accent,
        }}
      />
    </View>
  );
}

function PlayBadge({ accent }: { accent: string }) {
  return (
    <View style={[styles.play, { backgroundColor: accent }]}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="#000">
        <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
      </Svg>
    </View>
  );
}

type Person = {
  key: string;
  name: string;
  avatar?: Thumbnail[];
  fresh: boolean;
  open: () => void;
};

/** Channels you're subscribed to and artists you follow, newest uploads first, with a dot for anything new. */
export function YourPeople({
  videos,
  accent,
}: {
  videos: boolean;
  accent: string;
}) {
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const artists = useLibrary((s) => s.followedArtists);
  const subs = useSubsFeed(videos && signedIn);
  const people: Person[] = [];
  const seen = new Set<string>();
  for (const v of subs.data?.items ?? []) {
    const c = v.channel;
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const id = c.id;
    people.push({
      key: id,
      name: c.name,
      avatar: c.avatar,
      fresh: FRESH.test(v.publishedText ?? ""),
      open: () => go(`/channel/${id}`),
    });
  }
  for (const a of artists) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    people.push({
      key: a.id,
      name: a.name,
      avatar: a.thumbnails,
      fresh: false,
      open: () => go(`/artist/${a.id}`),
    });
  }
  if (!people.length) return null;
  return (
    <View>
      <SectionTitle title="Your people" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.people}
      >
        {people.slice(0, 24).map((p) => (
          <PressScale key={p.key} onPress={p.open} style={styles.person}>
            <View>
              <Artwork thumbnails={p.avatar} size={64} round seed={p.name} />
              {p.fresh ? (
                <View style={[styles.dot, { backgroundColor: accent }]} />
              ) : null}
            </View>
            <Text style={styles.personName} numberOfLines={1}>
              {p.name}
            </Text>
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}

/** A few videos from a feed, then a way to see them all; edge to edge on phones, a row of tiles on wide screens. */
export function VideoShelf({
  kind,
  title,
}: {
  kind: "subs" | "home";
  title: string;
}) {
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const subs = useSubsFeed(kind === "subs" && signedIn);
  const home = useVideoHome(kind === "home");
  const feed = kind === "subs" ? subs : home;
  const keep = useVideoFilter();
  const [width, setWidth] = useState(0);
  if (kind === "subs" && !signedIn) return null;
  const items = (feed.data?.items ?? []).filter((v: VideoItem) => keep(v));
  const wide = width >= 640;
  const more = () => push(`/(tabs)/(home)/videos?feed=${kind}`);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <SectionTitle title={title} onMore={more} />
      {!feed.data ? (
        feed.error ? null : (
          <SkeletonShelves count={1} />
        )
      ) : wide ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tiles}
        >
          {items.slice(0, 10).map((v) => (
            <View key={v.id} style={{ width: 300 }}>
              <VideoCard video={v} tile />
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
          {items.slice(0, 4).map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
          {items.length > 4 ? (
            <PressScale onPress={more} style={styles.all}>
              <Text style={styles.allText}>All videos</Text>
            </PressScale>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    maxWidth: 640,
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#111",
    justifyContent: "flex-end",
  },
  heroText: { padding: 16, paddingRight: 72 },
  heroKicker: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    ...display("700"),
  },
  heroTitle: { color: "#fff", fontSize: 19, marginTop: 4, ...display("800") },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 2 },
  songHero: {
    aspectRatio: undefined,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    paddingRight: 72,
  },
  songDim: { backgroundColor: "rgba(0,0,0,0.45)" },
  play: {
    position: "absolute",
    right: 16,
    bottom: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  minis: { paddingHorizontal: 16, gap: 12, paddingTop: 12 },
  mini: { width: 168 },
  miniPic: {
    width: 168,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  miniTitle: { color: "#fff", fontSize: 13, marginTop: 8, fontWeight: "600" },
  people: { paddingHorizontal: 16, gap: 14 },
  person: { width: 72, alignItems: "center" },
  personName: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  dot: {
    position: "absolute",
    right: 2,
    top: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: "#000",
  },
  tiles: { paddingHorizontal: 16, gap: 16 },
  all: {
    alignSelf: "center",
    paddingHorizontal: 18,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  allText: { color: "#fff", fontSize: 14, ...display("700") },
});
