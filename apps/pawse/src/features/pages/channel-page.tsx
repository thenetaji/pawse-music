import {
  bestThumbnail,
  type ChannelPage as Page,
  type ChannelSort,
  type ChannelTab,
  type ChannelTabPage,
  type VideoItem,
  type VideoPlaylistItem,
} from "@pawse/music-core";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { showSheet } from "../../components/action-sheet";
import {
  CloseGlyph,
  HideGlyph,
  PinGlyph,
  ShareGlyph,
} from "../../components/glyphs";
import {
  CatState,
  Chip,
  PressScale,
  Screen,
  SectionTitle,
  SkeletonShelves,
} from "../../components/ui";
import { VideoCard, VideoPlaylistRow } from "../../components/video-card";
import { markChannelSeen, useSubscribed } from "../../data/channels";
import { isPinned, togglePin } from "../../data/pins";
import { blockChannel, useVideoFilter } from "../../lib/block";
import { ytv } from "../../lib/engine";
import { useFocus } from "../../lib/focus";
import { haptic } from "../../lib/haptics";
import { toggleSubscription } from "../../lib/subscribe";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { VideoStrip } from "../home/home-blocks";
import { MoreGlyph } from "../now-playing/icons";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

type Item = VideoItem | VideoPlaylistItem;
type Shown = Pick<
  ChannelTabPage,
  "items" | "sections" | "sorts" | "continuation"
>;

const NONE = {
  items: [] as Item[],
  continuation: undefined as string | undefined,
  started: false,
};

export default function ChannelPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useResource<Page>(`channel:${id}`, () => ytv.channel(id));
  const p = page.data;
  const tabs = p?.tabs ?? [];

  // Videos comes with the channel page; other tabs and sorted lists load when chosen.
  const [tabKind, setTabKind] = useState<ChannelTab["kind"]>();
  const [sort, setSort] = useState<ChannelSort>();
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const kind =
    tabKind && tabs.some((t) => t.kind === tabKind)
      ? tabKind
      : tabs.some((t) => t.kind === "videos")
        ? "videos"
        : (tabs[0]?.kind ?? "videos");
  const tab = tabs.find((t) => t.kind === kind);
  const first = kind === "videos" && !sort && !query;
  const tabPage = useResource<ChannelTabPage>(
    p && tab && !first && !query
      ? `channel:${id}:${kind}:${sort?.token ?? sort?.params ?? ""}`
      : null,
    () =>
      ytv.channelTab(
        id,
        sort?.token
          ? { continuation: sort.token }
          : { params: sort?.params ?? tab?.params },
      ),
  );
  const found = useResource<ChannelTabPage>(
    p?.search && query ? `channel:${id}:q:${query}` : null,
    () => ytv.channelTab(id, { params: p?.search, query }),
  );
  const view = query ? found : first ? page : tabPage;
  // A refreshed first page replaces the pages after it, so `base` ties them together.
  const base: unknown = query ? found.data : first ? p : tabPage.data;
  const shown: Shown | undefined = query
    ? found.data
    : first
      ? p && { items: p.videos, sorts: p.sorts, continuation: p.continuation }
      : tabPage.data;
  const viewKey = `${kind}|${sort?.token ?? sort?.params ?? ""}|${query}`;

  const [more, setMore] = useState<
    typeof NONE & { key: string; base?: unknown }
  >({ ...NONE, key: viewKey });
  const [busy, setBusy] = useState(false);
  const extra = more.key === viewKey && more.base === base ? more : NONE;
  const cont = extra.started ? extra.continuation : shown?.continuation;
  const loadMore = () => {
    if (busy || !cont) return;
    setBusy(true);
    ytv
      .channelTab(id, { continuation: cont })
      .then((r) =>
        setMore({
          key: viewKey,
          base,
          items: [...extra.items, ...r.items],
          continuation: r.continuation,
          started: true,
        }),
      )
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  // A cached copy shows at once, then it refetches.
  const refetch = useEffectEvent(() => void page.reload());
  useEffect(() => refetch(), [id]);
  const newest = p?.videos[0]?.id;
  useEffect(() => {
    if (id && newest) markChannelSeen(id, newest);
  }, [id, newest]);

  const avatar = p ? bestThumbnail(p.channel.avatar, 240) : undefined;
  const banner = p?.banner?.length ? bestThumbnail(p.banner, 1060) : undefined;
  const subscribed = useSubscribed(id, p?.subscribed);
  const focus = useFocus();
  const accent = useAccent();
  const keep = useVideoFilter();
  const me = p && {
    id: p.channel.id,
    name: p.channel.name,
    avatar: p.channel.avatar,
  };

  const seen = new Set<string>();
  const list: Item[] = [...(shown?.items ?? []), ...extra.items]
    .filter((i) => !seen.has(i.id) && !!seen.add(i.id))
    .filter((i) => i.type !== "video" || keep(i))
    .map((i) =>
      i.type === "video" && !i.channel && me ? { ...i, channel: me } : i,
    );
  const sections = (kind === "home" && !query ? shown?.sections : undefined)
    ?.map((sec) => ({
      ...sec,
      items: sec.items.filter((i) => i.type !== "video" || keep(i)),
    }))
    .filter((sec) => sec.items.length);
  // Chips stay up, the chosen one lit, while a sorted list loads.
  const sorts = query
    ? undefined
    : (shown?.sorts ?? (kind === "videos" ? p?.sorts : undefined));
  const sortOn = (s: ChannelSort) =>
    sort ? sort.title === s.title : !!s.selected;

  const pick = (k: ChannelTab["kind"]) => {
    haptic.tick();
    setTabKind(k);
    setSort(undefined);
    setQuery("");
    setSearching(false);
  };
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setQuery(v);
    Keyboard.dismiss();
  };
  const closeSearch = () => {
    setSearching(false);
    setText("");
    setQuery("");
    Keyboard.dismiss();
  };

  const showAbout = () => {
    if (!p) return;
    const open = (url: string) =>
      Linking.openURL(url).catch(() => Share.share({ message: url }));
    // The About panel is slow at times, so the sheet opens without it after 2.5 s.
    void Promise.race([
      p.about ? ytv.channelAbout(p.about) : undefined,
      new Promise<undefined>((r) => setTimeout(r, 2500)),
    ])
      .catch(() => undefined)
      .then((a) =>
        showSheet({
          header: (
            <AboutHeader
              name={p.channel.name}
              description={a?.description ?? p.description}
              facts={[
                a?.joined,
                a?.viewsText,
                a?.country,
                a?.subscribersText ?? p.channel.subscribersText,
                a?.videoCountText ?? p.videoCountText,
              ]}
            />
          ),
          actions: (a?.links ?? []).map((l) => ({
            label: l.title,
            sub: l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
            onPress: () => open(l.url),
          })),
        }),
      );
  };
  const showMore = () =>
    me &&
    showSheet({
      actions: [
        {
          label: isPinned(me.id) ? "Unpin from Home" : "Pin to Home",
          icon: (c) => <PinGlyph size={22} color={c} />,
          onPress: () =>
            togglePin({
              kind: "channel",
              id: me.id,
              title: me.name,
              thumbnails: me.avatar,
            }),
        },
        {
          label: "Share",
          icon: (c) => <ShareGlyph size={22} color={c} />,
          onPress: () => {
            const link = `https://www.youtube.com/channel/${me.id}`;
            void Share.share(
              Platform.OS === "ios" ? { url: link } : { message: link },
            );
          },
        },
        {
          label: `Don't show ${me.name}`,
          icon: (c) => <HideGlyph size={22} color={c} />,
          destructive: true,
          onPress: () => blockChannel({ id: me.id, name: me.name }),
        },
      ],
    });

  const row = (i: Item, n: number) => (
    <Animated.View
      key={`${i.type}${i.id}`}
      entering={FadeInDown.duration(360).delay(Math.min(n, 6) * 50)}
    >
      {i.type === "video" ? (
        <VideoCard video={i} hideChannel />
      ) : (
        <VideoPlaylistRow list={i} />
      )}
    </Animated.View>
  );

  return (
    <Screen
      title={p?.channel.name ?? ""}
      back
      background={<TopGlow height={300} />}
      onEndReached={loadMore}
      onRefresh={() =>
        Promise.all([page.reload(), view !== page ? view.reload() : undefined])
      }
      right={
        p ? (
          <PressScale
            onPress={showMore}
            hitSlop={10}
            accessibilityLabel="More"
            style={styles.more}
          >
            <MoreGlyph size={20} />
          </PressScale>
        ) : undefined
      }
    >
      {p ? (
        <>
          {banner ? (
            <Image source={banner} style={styles.banner} contentFit="cover" />
          ) : null}
          <View style={styles.head}>
            {avatar ? <Image source={avatar} style={styles.avatar} /> : null}
            <View style={{ flex: 1 }}>
              {p.handle ? (
                <Text style={styles.handle} numberOfLines={1}>
                  {p.handle}
                </Text>
              ) : null}
              {focus.counts &&
              (p.channel.subscribersText || p.videoCountText) ? (
                <Text style={styles.subs} numberOfLines={1}>
                  {[p.channel.subscribersText, p.videoCountText]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
            <PressScale
              onPress={() => {
                haptic.light();
                if (me) toggleSubscription(me, subscribed);
              }}
              accessibilityLabel={subscribed ? "Unsubscribe" : "Subscribe"}
              style={[
                styles.subBtn,
                subscribed ? styles.subOn : { backgroundColor: accent },
              ]}
            >
              <Text style={[styles.subText, subscribed && styles.subTextOn]}>
                {subscribed ? "Subscribed" : "Subscribe"}
              </Text>
            </PressScale>
          </View>
          {p.description ? (
            <Pressable onPress={showAbout} style={styles.about}>
              <Text style={styles.aboutText} numberOfLines={2}>
                {p.description}
              </Text>
              <Text style={styles.aboutMore}>More about this channel</Text>
            </Pressable>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {p.search ? (
              <PressScale
                onPress={() => (searching ? closeSearch() : setSearching(true))}
                accessibilityLabel="Search this channel"
                style={[styles.searchBtn, searching && { borderColor: accent }]}
              >
                <Svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                >
                  <Circle cx="11" cy="11" r="7" />
                  <Path d="M20 20l-3.5-3.5" />
                </Svg>
              </PressScale>
            ) : null}
            {tabs.map((t) => (
              <Chip
                key={t.kind}
                label={t.title}
                on={!query && t.kind === kind}
                accent={accent}
                onPress={() => pick(t.kind)}
              />
            ))}
          </ScrollView>
          {searching ? (
            <View style={styles.field}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={submit}
                placeholder={`Search ${p.channel.name}`}
                placeholderTextColor="rgba(255,255,255,0.4)"
                returnKeyType="search"
                autoFocus
                autoCorrect={false}
                selectionColor={accent}
                style={styles.input}
              />
              {text || query ? (
                <Pressable
                  hitSlop={10}
                  onPress={closeSearch}
                  style={styles.clear}
                >
                  <CloseGlyph size={10} weight={3.2} color="#000" />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {sorts?.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sorts}
            >
              {sorts.map((s) => (
                <Chip
                  key={s.title}
                  label={s.title}
                  on={sortOn(s)}
                  accent={accent}
                  onPress={() => {
                    if (sortOn(s)) return;
                    haptic.tick();
                    setSort(s);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
          <View style={{ height: 12 }} />
          {sections ? (
            sections.map((sec) =>
              sec.items.every((i) => i.type === "video") ? (
                <VideoStrip
                  key={sec.title}
                  title={sec.title}
                  items={sec.items as VideoItem[]}
                  accent={accent}
                />
              ) : (
                <View key={sec.title}>
                  <SectionTitle title={sec.title} />
                  {sec.items.slice(0, 5).map(row)}
                </View>
              ),
            )
          ) : shown ? (
            list.length ? (
              list.map(row)
            ) : busy ? null : (
              <CatState
                kind="empty"
                message={query ? "Nothing for that." : "Nothing here yet."}
              />
            )
          ) : view.error ? (
            <CatState
              kind="error"
              message="Couldn't load this."
              action="Try again"
              onAction={view.reload}
            />
          ) : (
            <SkeletonShelves />
          )}
          {busy ? <SkeletonShelves count={1} /> : null}
        </>
      ) : page.error ? (
        <CatState
          kind="error"
          message="Couldn't open this channel."
          action="Try again"
          onAction={page.reload}
        />
      ) : (
        <SkeletonShelves />
      )}
    </Screen>
  );
}

function AboutHeader({
  name,
  description,
  facts,
}: {
  name: string;
  description?: string;
  facts: (string | undefined)[];
}) {
  const lines = facts.filter(Boolean) as string[];
  return (
    <View style={styles.aboutHead}>
      <Text style={styles.aboutName} numberOfLines={1}>
        {name}
      </Text>
      {description ? (
        <ScrollView style={styles.aboutScroll}>
          <Text style={styles.aboutBody}>{description}</Text>
        </ScrollView>
      ) : null}
      {lines.map((l) => (
        <Text key={l} style={styles.aboutFact}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 14,
    aspectRatio: 5.5,
    borderRadius: 12,
    backgroundColor: "#111",
  },
  handle: { color: "#fff", fontSize: 15, ...display("700") },
  about: { marginHorizontal: 16, marginBottom: 14 },
  aboutText: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 19 },
  aboutMore: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 4,
    ...display("700"),
  },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  sorts: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  input: { flex: 1, color: "#fff", fontSize: 16, height: 40 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  aboutHead: { paddingHorizontal: 4, gap: 8 },
  aboutName: { color: "#fff", fontSize: 18, ...display("800") },
  aboutScroll: { maxHeight: 220 },
  aboutBody: { color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 20 },
  aboutFact: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#222" },
  subs: { color: "rgba(255,255,255,0.65)", fontSize: 14, ...display("700") },
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  subBtn: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    justifyContent: "center",
  },
  subOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  subText: { color: "#fff", fontSize: 14, ...display("800") },
  subTextOn: { color: "rgba(255,255,255,0.85)" },
});
