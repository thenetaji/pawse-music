import type {
  HomeFeed,
  Shelf as ShelfT,
  Track,
  VideoFeed,
  VideoItem,
} from "@pawse/music-core";
import { player } from "@pawse/player";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { CaughtUp } from "../../components/caught-up";
import { IncognitoGlyph } from "../../components/glyphs";
import { IncognitoChip } from "../../components/incognito-chip";
import { useTabRoot } from "../../components/page";
import { Shelf } from "../../components/shelf";
import { TrackRow } from "../../components/track-row";
import {
  CatState,
  Chip,
  PressScale,
  Screen,
  SectionTitle,
  SkeletonShelves,
} from "../../components/ui";
import { VideoCard } from "../../components/video-card";
import type { DailyMix } from "../../data/account";
import { dailyMixes, useLibrary } from "../../data/library";
import { useForYou } from "../../data/recommend";
import { useVideoFilter } from "../../lib/block";
import { rightClick } from "../../lib/context-menu";
import { yt } from "../../lib/engine";
import { forYou } from "../../lib/for-you";
import { HOME_SECTIONS, useHomeSections } from "../../lib/home-sections";
import { setIncognito, useIncognito } from "../../lib/incognito";
import { push } from "../../lib/nav";
import { keepShelves, useHomeKeep } from "../../lib/remove-song";
import { autoplayMode, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { refreshResources, useResource } from "../../lib/use-resource";
import { Cat, type CatColor } from "../cat/cat";
import { ContinueCard, VideoShelf, YourPeople } from "../home/home-blocks";
import { Pinned } from "../home/pinned";
import { showTrackActions } from "../library/track-actions";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

type Mood = { title: string; params: string };

export default function HomePage() {
  useTabRoot("home");
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const incognito = useIncognito();
  const videos = useSetting("videos", true);
  const sections = useHomeSections().filter(
    (s) =>
      s.on && (videos || !HOME_SECTIONS.find((d) => d.id === s.id)?.videos),
  );
  // The endless feed: YouTube Music's shelves with YouTube's videos woven in; Focus mode leaves it out.
  const full = sections.some((s) => s.id === "picks");
  const [chip, setChip] = useState<string | undefined>();
  const home = useResource<HomeFeed>(
    full ? `home:${chip ?? ""}` : null,
    () => yt.home(chip),
    { keep: true },
  );
  const moods = useResource<Mood[]>(
    "explore:moods",
    () => yt.moodsAndGenres(),
    { keep: true },
  );
  const key = chip ?? "";
  // Extra pages: YouTube's own continuations first, then one mood page at a time, so the feed never ends.
  const [more, setMore] = useState<{
    key: string;
    shelves: ShelfT[];
    continuation?: string;
    mood: number;
  }>({ key, shelves: [], mood: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const extra =
    more.key === key
      ? more
      : { key, shelves: [], continuation: undefined, mood: 0 };
  const cont =
    extra.shelves.length || extra.mood
      ? extra.continuation
      : home.data?.continuation;
  const keep = useHomeKeep();
  const shelves = keepShelves(
    [...(home.data?.shelves ?? []), ...extra.shelves],
    keep,
  );

  // Videos for the endless feed start after the four Suggested videos shows.
  const vhome = useResource<VideoFeed>(
    full && videos ? "watch:home" : null,
    () => forYou(),
    { keep: true },
  );
  const [vmore, setVmore] = useState<{
    items: VideoItem[];
    cont?: string;
    started: boolean;
  }>({ items: [], started: false });
  const [loadingVideos, setLoadingVideos] = useState(false);
  const keepVideo = useVideoFilter();
  const vcont = vmore.started ? vmore.cont : vhome.data?.continuation;
  const feedVideos =
    full && videos
      ? [...(vhome.data?.items.slice(4) ?? []), ...vmore.items].filter((v) =>
          keepVideo(v),
        )
      : [];
  const moreVideos = () => {
    if (!videos || loadingVideos || !vcont) return;
    setLoadingVideos(true);
    forYou(vcont)
      .then((r) =>
        setVmore({
          items: [...vmore.items, ...r.items],
          cont: r.continuation,
          started: true,
        }),
      )
      .catch(() => {})
      .finally(() => setLoadingVideos(false));
  };

  const loadMore = () => {
    moreVideos();
    if (loadingMore || !home.data) return;
    const list = moods.data ?? [];
    let next: Promise<{
      shelves: ShelfT[];
      continuation?: string;
      mood: number;
    }>;
    if (cont)
      next = yt.homeMore(cont).then((r) => ({
        shelves: r.shelves,
        continuation: r.continuation,
        mood: extra.mood,
      }));
    else if (extra.mood < list.length) {
      const m = list[extra.mood];
      next = yt.moodPage(m.params).then((sh) => ({
        shelves: sh
          .slice(0, 3)
          .map((x, i) =>
            i === 0 ? { ...x, title: `${m.title} · ${x.title}` } : x,
          ),
        mood: extra.mood + 1,
      }));
    } else return;
    setLoadingMore(true);
    next
      .then((r) =>
        setMore({
          key,
          shelves: [...extra.shelves, ...r.shelves],
          continuation: r.continuation,
          mood: r.mood,
        }),
      )
      .catch(() => setMore({ ...extra, key, mood: extra.mood + 1 }))
      .finally(() => setLoadingMore(false));
  };

  return (
    <Screen
      title={greeting()}
      tab="home"
      background={<TopGlow />}
      onRefresh={() =>
        Promise.all([home.reload(), refreshResources(["watch:", "home:mixes"])])
      }
      onEndReached={full ? loadMore : undefined}
      right={
        <View style={styles.headRight}>
          <IncognitoChip />
          <HomeCat />
          <PressScale
            onPress={() => push("/settings")}
            onLongPress={() =>
              showSheet({
                actions: [
                  {
                    label: incognito
                      ? "Turn off incognito"
                      : "Turn on incognito",
                    icon: (c) => <IncognitoGlyph size={22} color={c} />,
                    onPress: () => setIncognito(!incognito),
                  },
                ],
              })
            }
            style={styles.gear}
            hitSlop={Platform.OS === "android" ? 5 : undefined}
            accessibilityLabel="Settings"
          >
            <GearGlyph />
          </PressScale>
        </View>
      }
    >
      <CatLine />
      {!signedIn ? <SignInCard accent={accent} /> : null}
      {sections.map((sec) => {
        switch (sec.id) {
          case "continue":
            return <ContinueCard key={sec.id} accent={accent} />;
          case "pinned":
            return <Pinned key={sec.id} />;
          case "people":
            return <YourPeople key={sec.id} videos={videos} accent={accent} />;
          case "new":
            return (
              <VideoShelf
                key={sec.id}
                kind="subs"
                title="New from your channels"
              />
            );
          case "jump":
            return <JumpBackIn key={sec.id} />;
          case "mixes":
            return <Mixes key={sec.id} />;
          case "foryou":
            return <ForYou key={sec.id} />;
          case "liked":
            return <LikedLately key={sec.id} />;
          case "ytvideos":
            return (
              <VideoShelf key={sec.id} kind="home" title="Suggested videos" />
            );
          case "picks":
            return (
              <Picks
                key={sec.id}
                home={home}
                shelves={shelves}
                videos={feedVideos}
                chip={chip}
                setChip={setChip}
                accent={accent}
              />
            );
        }
      })}
      {full && home.data ? (
        <EndSpinner loading={loadingMore || loadingVideos} onPress={loadMore} />
      ) : (
        <>
          <PressScale onPress={() => push("/edit-home")} style={styles.edit}>
            <Text style={styles.editText}>Edit Home</Text>
          </PressScale>
          <CaughtUp />
        </>
      )}
    </Screen>
  );
}

// YouTube Music's home feed: mood chips, then shelves that keep loading as you scroll.
function Picks({
  home,
  shelves,
  videos,
  chip,
  setChip,
  accent,
}: {
  home: { data?: HomeFeed; error?: Error; reload: () => void };
  shelves: ShelfT[];
  videos: VideoItem[];
  chip?: string;
  setChip: (c?: string) => void;
  accent: string;
}) {
  return (
    <View>
      <SectionTitle title="More for you" />
      {home.data?.chips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {home.data.chips.map((c) => (
            <Chip
              key={c.params}
              label={c.title}
              on={c.params === chip}
              accent={accent}
              onPress={() => setChip(c.params === chip ? undefined : c.params)}
            />
          ))}
        </ScrollView>
      ) : null}
      {home.data ? (
        weave(shelves, videos).map((b, i) => (
          <Animated.View
            key={b.key}
            entering={FadeInDown.duration(420).delay(Math.min(i % 8, 6) * 60)}
          >
            {b.shelf ? (
              <Shelf shelf={b.shelf} removable />
            ) : b.video ? (
              <View style={b.first && styles.afterShelf}>
                <VideoCard video={b.video} />
              </View>
            ) : null}
          </Animated.View>
        ))
      ) : home.error ? (
        <CatState
          kind="error"
          message="Couldn't load your feed."
          action="Try again"
          onAction={home.reload}
        />
      ) : (
        <SkeletonShelves />
      )}
    </View>
  );
}

// Two music shelves, then three videos, and so on; whichever runs out, the other keeps going.
function weave(shelves: ShelfT[], videos: VideoItem[]) {
  const out: {
    key: string;
    shelf?: ShelfT;
    video?: VideoItem;
    /** The first video after a shelf, which needs room above it. */
    first?: boolean;
  }[] = [];
  let v = 0;
  const addVideos = (list: VideoItem[]) =>
    list.forEach((video) =>
      out.push({
        key: `v${v++}:${video.id}`,
        video,
        first: !!out[out.length - 1]?.shelf,
      }),
    );
  shelves.forEach((shelf, i) => {
    out.push({ key: `s${i}:${shelf.title}`, shelf });
    if (i % 2 === 1) addVideos(videos.slice(v, v + 3));
  });
  addVideos(videos.slice(v));
  return out;
}

function LikedLately() {
  const liked = useLibrary((s) => s.liked);
  const recent = liked.slice(0, 6);
  if (!recent.length) return null;
  return (
    <View>
      <SectionTitle title="Liked lately" />
      {recent.map((t, i) => (
        <TrackRow
          key={t.id}
          track={t}
          onPress={() =>
            void player.play(recent, i, {
              source: { type: "library", title: "Liked songs" },
            })
          }
        />
      ))}
    </View>
  );
}

// Keeps loading at the bottom; also tappable in case a scroll event was missed.
function EndSpinner({
  loading,
  onPress,
}: {
  loading: boolean;
  onPress: () => void;
}) {
  return loading ? (
    <SkeletonShelves count={1} />
  ) : (
    <Pressable onPress={onPress} style={styles.more}>
      <Text style={styles.moreText}>Load more</Text>
    </Pressable>
  );
}

function SignInCard({ accent }: { accent: string }) {
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  return (
    <PressScale
      onPress={() => push("/sign-in")}
      style={[styles.signIn, { borderColor: accent }]}
    >
      <Cat mood="curious" size={54} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.signTitle}>Make it yours</Text>
        <Text style={styles.signSub}>
          Sign in to YouTube Music so {name} learns your taste.
        </Text>
      </View>
      <Text style={[styles.signGo, { color: accent }]}>Sign in</Text>
    </PressScale>
  );
}

// Built on the phone from your plays, likes and picks, so it works signed out too.
function ForYou() {
  const fy = useForYou();
  const list = keepShelves(fy.shelves, useHomeKeep());
  if (!list.length) return fy.loading ? <SkeletonShelves count={1} /> : null;
  return (
    <>
      {list.map((s, i) => (
        <Animated.View
          key={`${s.title}${i}`}
          entering={FadeInDown.duration(380).delay(i * 50)}
        >
          <Shelf shelf={s} removable />
        </Animated.View>
      ))}
    </>
  );
}

// "Jump back in": your recent plays as big tiles, one tap to resume.
function JumpBackIn({ max = 6 }: { max?: number }) {
  const history = useLibrary((s) => s.history);
  const keep = useHomeKeep();
  const seen = new Set<string>();
  const recent: Track[] = [];
  for (const h of history) {
    if (seen.has(h.track.id) || !keep(h.track)) continue;
    seen.add(h.track.id);
    recent.push(h.track);
    if (recent.length === max) break;
  }
  if (recent.length < 2) return null;
  return (
    <View>
      <SectionTitle title="Jump back in" />
      <View style={styles.grid}>
        {recent.map((t, i) => (
          <PressScale
            key={t.id}
            onPress={() =>
              void player.play(recent, i, {
                radio: autoplayMode() !== "off",
                source: { type: "library", title: "Recently played" },
              })
            }
            onLongPress={() => showTrackActions(t, { removable: true })}
            {...rightClick(() => showTrackActions(t, { removable: true }))}
            style={styles.tile}
          >
            <Artwork thumbnails={t.thumbnails} size={52} radius={8} />
            <Text style={styles.tileText} numberOfLines={2}>
              {t.title}
            </Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

// Daily mixes: endless radios seeded from your top artists.
function Mixes() {
  const mixes = useResource<DailyMix[]>("home:mixes", () => dailyMixes());
  if (!mixes.data?.length) return null;
  return (
    <View>
      <SectionTitle title="Your mixes" kicker="Made for you" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
      >
        {mixes.data.map((m, i) => (
          <PressScale
            key={m.playlistId}
            onPress={() =>
              void player.playRadio({
                playlistId: m.playlistId,
                title: `${m.artist.name} mix`,
              })
            }
            style={styles.mix}
          >
            <Artwork thumbnails={m.artist.thumbnails} size={152} radius={18} />
            <View
              style={[styles.mixBand, { backgroundColor: MIX[i % MIX.length] }]}
            >
              <Text style={styles.mixNo}>Mix {i + 1}</Text>
            </View>
            <Text style={styles.mixName} numberOfLines={1}>
              {m.artist.name} and more
            </Text>
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}
const MIX = ["#FF5A7A", "#8B7CFF", "#2ED3A2", "#FF9F43", "#38B6FF", "#F5D547"];

function HomeCat() {
  const color = useSetting<CatColor>("catColor", "orange");
  const h = new Date().getHours();
  return (
    <Cat
      mood={h >= 23 || h < 6 ? "sleep" : "groove"}
      size={40}
      color={color}
      beatMs={900}
    />
  );
}

function GearGlyph() {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function CatLine() {
  const name = useSetting("catName", "Mochi");
  const h = new Date().getHours();
  const line =
    h < 6
      ? `${name} is asleep. Keep it soft.`
      : h < 12
        ? `${name} picked something bright for the morning.`
        : h < 17
          ? `${name} is in the mood for anything.`
          : h < 23
            ? `${name} is warming up the evening.`
            : `${name} is napping. Night mode.`;
  return <Text style={styles.catLine}>{line}</Text>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? "Late night"
    : h < 12
      ? "Good morning"
      : h < 17
        ? "Afternoon"
        : "Evening";
}

const styles = StyleSheet.create({
  afterShelf: { marginTop: 28 },
  headRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  gear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chips: { paddingHorizontal: 20, gap: 8, marginTop: 14 },
  catLine: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  signIn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  signTitle: { color: "#fff", fontSize: 16, ...display("800") },
  signSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  signGo: { fontSize: 15, ...display("800") },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
  },
  tile: {
    width: "48.6%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    paddingRight: 8,
  },
  tileText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  mix: { width: 152 },
  mixBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 118,
    height: 34,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  mixNo: { color: "#000", fontSize: 14, ...display("900") },
  mixName: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 8 },
  edit: {
    alignSelf: "center",
    marginTop: 30,
    paddingHorizontal: 18,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  editText: { color: "#fff", fontSize: 14, ...display("700") },
  more: {
    alignSelf: "center",
    marginTop: 26,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  moreText: { color: "#fff", fontSize: 14, ...display("700") },
});
