import {
  type ArtistSummary,
  type CatalogItem,
  type SearchSuggestions,
  type Shelf as ShelfT,
  type VideoSearchResults,
} from "@pawse/music-core";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { CloseGlyph } from "../../components/glyphs";
import { MoodTile } from "../../components/mood-tile";
import { useBottomSpace, useTabRoot } from "../../components/page";
import {
  CatState,
  Chip,
  SectionTitle,
  SkeletonRows,
} from "../../components/ui";
import {
  ChannelRow,
  VideoCard,
  VideoPlaylistRow,
} from "../../components/video-card";
import { useLibrary } from "../../data/library";
import { type BlockedChannel, useVideoFilter } from "../../lib/block";
import { yt, ytv } from "../../lib/engine";
import { useFocus } from "../../lib/focus";
import { useRegion } from "../../lib/locale";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { useAccent } from "../now-playing/now-palette";
import {
  groupShelves,
  type Kind,
  KINDS,
  musicFilter,
  namesMatch,
  rememberSearchArt,
  searchArt,
  usePaged,
  useSuggestions,
} from "../search/search-data";
import {
  EntityRow,
  ErrorState,
  ItemRow,
  ListFoot,
  QueryRow,
  RecentRow,
  ResultsSkeleton,
  SectionHead,
  SongRow,
  TopResult,
} from "../search/search-rows";

type Tile = { title: string; params: string; color?: string };
type Video = VideoSearchResults["items"][number];

// A few of each kind in the All tab; "See all" opens the rest under its own chip.
const PEEK = {
  songs: 4,
  videos: 5,
  albums: 3,
  artists: 3,
  playlists: 3,
  channels: 3,
};
const SECTION: Record<Kind, string> = {
  all: "All",
  songs: "Songs",
  videos: "Videos",
  albums: "Albums",
  artists: "Artists",
  playlists: "Playlists",
  channels: "Channels",
};

export default function SearchPage() {
  useTabRoot("search");
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const accent = useAccent();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  // The field is in use: suggestions while there are words, recent searches while there aren't.
  // It stays on after the keyboard is dragged away, so the list under your thumb doesn't change.
  const [suggesting, setSuggesting] = useState(false);
  const videos = useSetting("videos", true);
  const focus = useFocus();
  const recent = useLibrary((s) => s.recentSearches);

  const typed = text.trim();
  const debounced = useDebounced(typed, 180);
  const suggestions = useSuggestions(debounced, suggesting && focus.trends);
  const kinds = KINDS.filter((k) => videos || !k.youtube);
  const shown = kinds.some((k) => k.id === kind) ? kind : "all";

  const submit = (q: string) => {
    const v = q.trim();
    if (!v) return;
    setText(v);
    setQuery(v);
    setKind("all");
    setSuggesting(false);
    Keyboard.dismiss();
    useLibrary.getState().addSearch(v);
  };
  // A song or artist picked from the suggestions opens on its own, so the suggestions close behind it.
  const leave = () => {
    Keyboard.dismiss();
    setSuggesting(false);
    setText(query);
  };
  const cancel = () => {
    Keyboard.dismiss();
    setSuggesting(false);
    // With results behind it, Cancel only closes the suggestions.
    if (suggesting && query) setText(query);
    else {
      setText("");
      setQuery("");
    }
  };
  // Puts a suggestion in the field to keep typing from it, like YouTube's arrow.
  const fill = (q: string) => {
    setText(`${q} `);
    setSuggesting(true);
    input.current?.focus();
  };

  const listing = suggesting && !!typed;
  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Animated.View
          layout={LinearTransition.duration(220)}
          style={styles.fieldRow}
        >
          <Pressable
            onPress={() => input.current?.focus()}
            style={[styles.field, suggesting && styles.fieldOn]}
          >
            <Svg
              width={17}
              height={17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={2.6}
              strokeLinecap="round"
            >
              <Circle cx="11" cy="11" r="7" />
              <Path d="M20 20l-3.5-3.5" />
            </Svg>
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              onFocus={() => setSuggesting(true)}
              onSubmitEditing={() => submit(text)}
              placeholder="Songs, artists, albums, videos"
              placeholderTextColor="rgba(255,255,255,0.4)"
              returnKeyType="search"
              enterKeyHint="search"
              submitBehavior="blurAndSubmit"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
              style={styles.input}
              selectionColor={accent}
            />
            {text ? (
              <Pressable
                hitSlop={10}
                accessibilityLabel="Clear"
                onPress={() => {
                  setText("");
                  setSuggesting(true);
                  input.current?.focus();
                }}
                style={styles.clear}
              >
                <CloseGlyph size={10} weight={3.2} color="#000" />
              </Pressable>
            ) : null}
          </Pressable>
          {suggesting || query ? (
            <Animated.View entering={FadeIn.duration(150)}>
              <Pressable
                hitSlop={Platform.OS === "android" ? 14 : 8}
                onPress={cancel}
              >
                <Text style={[styles.cancel, { color: accent }]}>Cancel</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
        {query && !listing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.filterRow}
            contentContainerStyle={styles.filters}
          >
            {kinds.map((k) => (
              <Chip
                key={k.id}
                label={k.label}
                on={shown === k.id}
                accent={accent}
                onPress={() => setKind(k.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.body}>
        {/* Results stay mounted under the suggestions, so closing them puts you back where you were. */}
        {query ? (
          <View style={[styles.body, suggesting && styles.hidden]}>
            <Results
              key={query}
              query={query}
              kind={shown}
              videos={videos}
              bottom={bottom}
              accent={accent}
              onKind={setKind}
            />
          </View>
        ) : null}
        {listing ? (
          <View style={styles.cover}>
            <Suggestions
              typed={typed}
              recent={recent}
              data={suggestions?.data}
              loading={focus.trends && !suggestions}
              bottom={bottom}
              onPick={submit}
              onFill={fill}
              onLeave={leave}
            />
          </View>
        ) : suggesting || !query ? (
          <View style={query ? styles.cover : styles.body}>
            <EmptySearch
              recent={recent}
              onPick={submit}
              onFill={fill}
              bottom={bottom}
              accent={accent}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// While you type: matching past searches, then YouTube's suggestions, then songs, artists and albums with their pictures.
function Suggestions({
  typed,
  recent,
  data,
  loading,
  bottom,
  onPick,
  onFill,
  onLeave,
}: {
  typed: string;
  recent: string[];
  data?: SearchSuggestions;
  loading: boolean;
  bottom: number;
  onPick: (q: string) => void;
  onFill: (q: string) => void;
  onLeave: () => void;
}) {
  const needle = typed.toLowerCase();
  const past = recent
    .filter((r) => r.toLowerCase().includes(needle))
    .slice(0, 3);
  const queries = (data?.queries ?? []).filter((q) => !past.includes(q));
  // Your own words always lead the list, so Search is one tap away even before YouTube answers.
  const own = [...past, ...queries].some((q) => q.toLowerCase() === needle);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: bottom, paddingTop: 4 }}
    >
      {own ? null : <QueryRow text={typed} onPick={onPick} onFill={onFill} />}
      {past.map((s) => (
        <QueryRow
          key={`r:${s}`}
          text={s}
          recent
          onPick={onPick}
          onFill={onFill}
        />
      ))}
      {queries.map((s) => (
        <QueryRow key={s} text={s} onPick={onPick} onFill={onFill} />
      ))}
      {data?.items.length ? <View style={styles.divider} /> : null}
      {(data?.items ?? []).slice(0, 5).map((i) => (
        <EntityRow key={`${i.type}:${i.id}`} item={i} onOpen={onLeave} />
      ))}
      {loading && !data ? <SkeletonRows count={4} /> : null}
    </ScrollView>
  );
}

function EmptySearch({
  recent,
  onPick,
  onFill,
  bottom,
  accent,
}: {
  recent: string[];
  onPick: (q: string) => void;
  onFill: (q: string) => void;
  bottom: number;
  accent: string;
}) {
  const moods = useResource<Tile[]>("explore:moods", () => yt.moodsAndGenres());
  const ideas = useSearchIdeas();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: bottom }}
    >
      {recent.length ? (
        <View>
          <View style={styles.recentHead}>
            <Text style={styles.recentTitle}>Recent</Text>
            <Pressable
              hitSlop={8}
              onPress={() => useLibrary.getState().clearSearches()}
            >
              <Text style={[styles.clearAll, { color: accent }]}>
                Clear all
              </Text>
            </Pressable>
          </View>
          {recent.slice(0, 8).map((s) => (
            <RecentRow
              key={s}
              text={s}
              art={searchArt(s)}
              onPick={onPick}
              onFill={onFill}
              onRemove={(q) => useLibrary.getState().removeSearch(q)}
            />
          ))}
        </View>
      ) : null}
      {ideas.length ? (
        <View>
          <SectionTitle title="Try" />
          <View style={styles.ideas}>
            {ideas.map((x) => (
              <Chip
                key={x}
                label={x}
                accent={accent}
                onPress={() => onPick(x)}
              />
            ))}
          </View>
        </View>
      ) : null}
      <SectionTitle title="Browse" />
      <View style={styles.grid}>
        {(moods.data ?? []).slice(0, 12).map((m, i) => (
          <Animated.View
            key={m.params}
            entering={FadeInDown.duration(320).delay(i * 30)}
            style={styles.cell}
          >
            <MoodTile
              title={m.title}
              params={m.params}
              color={m.color}
              index={i}
            />
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

// Artists you play or picked, then what's trending in your region, as one-tap searches.
function useSearchIdeas(): string[] {
  const history = useLibrary((s) => s.history);
  const seeds = useSetting<ArtistSummary[]>("seedArtists", []);
  const region = useRegion();
  const charts = useResource<ShelfT[]>(
    `explore:charts:${region}`,
    () => yt.charts(region),
    { keep: true },
  );
  const count = new Map<string, number>();
  for (const h of history.slice(0, 300))
    for (const a of h.track.artists.slice(0, 1))
      count.set(a.name, (count.get(a.name) ?? 0) + 1);
  const mine = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const trending = (charts.data ?? [])
    .flatMap((sh) => sh.items)
    .filter((i) => i.type === "artist")
    .map((i) => (i.type === "artist" ? i.name : ""));
  return [
    ...new Set([...mine.slice(0, 4), ...seeds.map((a) => a.name), ...trending]),
  ]
    .filter(Boolean)
    .slice(0, 10);
}

function Results({
  query,
  kind,
  videos,
  bottom,
  accent,
  onKind,
}: {
  query: string;
  kind: Kind;
  videos: boolean;
  bottom: number;
  accent: string;
  onKind: (k: Kind) => void;
}) {
  const f = musicFilter(kind);
  if (kind === "all")
    return (
      <AllResults
        query={query}
        videos={videos}
        bottom={bottom}
        accent={accent}
        onKind={onKind}
      />
    );
  if (f) return <MusicList query={query} filter={f} bottom={bottom} />;
  return (
    <YouTubeList
      query={query}
      type={kind === "channels" ? "channel" : "video"}
      bottom={bottom}
    />
  );
}

const rowKey = (i: CatalogItem) => `${i.type}:${i.id}`;
const ytKey = (v: Video) => `${v.type}:${v.id}`;
const EMPTY = "Nothing for that. Try other words.";

// One YouTube Music filter: songs, albums, artists or playlists, paging in as you reach the bottom.
function MusicList({
  query,
  filter,
  bottom,
}: {
  query: string;
  filter: "songs" | "albums" | "artists" | "playlists";
  bottom: number;
}) {
  const asPage = (r: Awaited<ReturnType<typeof yt.search>>) => ({
    items: r.items ?? r.shelves.flatMap((s) => s.items),
    cont: r.continuation,
  });
  const p = usePaged<CatalogItem>(
    `page:${filter}:${query}`,
    rowKey,
    () => yt.search(query, filter).then(asPage),
    (c) => yt.searchMore(c).then(asPage),
  );
  if (p.error) return <ErrorState onRetry={() => void p.reload()} />;
  if (p.loading) return <SkeletonRows />;
  if (!p.items.length) return <CatState kind="empty" message={EMPTY} />;
  return (
    <FlatList
      data={p.items}
      keyExtractor={rowKey}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={p.loadMore}
      onEndReachedThreshold={0.8}
      contentContainerStyle={{ paddingTop: 6, paddingBottom: bottom }}
      ListFooterComponent={
        <ListFoot
          loading={p.loadingMore}
          failed={p.failedMore}
          onRetry={p.loadMore}
        />
      }
      renderItem={({ item }) =>
        item.type === "track" ? (
          <SongRow track={item} siblings={p.items} />
        ) : (
          <ItemRow item={item} />
        )
      }
    />
  );
}

// Videos or channels from all of YouTube, never Shorts, minus anything blocked.
function useYouTubeSearch(
  query: string,
  type?: "video" | "channel",
  on = true,
) {
  const keep = useVideoFilter();
  const blocked = useSetting<BlockedChannel[]>("blockedChannels", []);
  const p = usePaged<Video>(
    on ? `page:${type ?? "youtube"}:${query}` : null,
    ytKey,
    () =>
      ytv
        .search(query, undefined, type)
        .then((r) => ({ items: r.items, cont: r.continuation })),
    (c) =>
      ytv
        .search(query, c)
        .then((r) => ({ items: r.items, cont: r.continuation })),
  );
  const items = p.items.filter((x) =>
    x.type === "video"
      ? keep(x)
      : x.type === "channel"
        ? !blocked.some((b) => b.id === x.id)
        : true,
  );
  return { ...p, items };
}

function YouTubeRow({ item }: { item: Video }) {
  return item.type === "channel" ? (
    <ChannelRow channel={item} />
  ) : item.type === "playlist" ? (
    <VideoPlaylistRow list={item} />
  ) : (
    <VideoCard video={item} />
  );
}

function YouTubeList({
  query,
  type,
  bottom,
}: {
  query: string;
  type: "video" | "channel";
  bottom: number;
}) {
  const p = useYouTubeSearch(query, type);
  if (p.error) return <ErrorState onRetry={() => void p.reload()} />;
  if (p.loading) return <SkeletonRows />;
  if (!p.items.length) return <CatState kind="empty" message={EMPTY} />;
  return (
    <FlatList
      data={p.items}
      keyExtractor={ytKey}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={p.loadMore}
      onEndReachedThreshold={0.8}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: bottom }}
      ListFooterComponent={
        <ListFoot
          loading={p.loadingMore}
          failed={p.failedMore}
          onRetry={p.loadMore}
        />
      }
      renderItem={({ item }) => <YouTubeRow item={item} />}
    />
  );
}

type Row =
  | { k: "top"; item: CatalogItem }
  | { k: "wait"; id: string; n: number }
  | { k: "head"; title: string; to?: Kind }
  | { k: "song"; item: CatalogItem & { type: "track" } }
  | { k: "item"; item: CatalogItem }
  | { k: "yt"; item: Video };

const rowId = (r: Row) =>
  r.k === "top"
    ? "top"
    : r.k === "wait"
      ? r.id
      : r.k === "head"
        ? `head:${r.title}`
        : r.k === "yt"
          ? `yt:${ytKey(r.item)}`
          : `${r.k}:${rowKey(r.item)}`;

// The All tab: with videos on it's YouTube itself, and when the words look like music the best match
// leads, then Songs, Videos, Albums, Artists, Playlists and Channels, each with See all.
function AllResults({
  query,
  videos,
  bottom,
  accent,
  onKind,
}: {
  query: string;
  videos: boolean;
  bottom: number;
  accent: string;
  onKind: (k: Kind) => void;
}) {
  const music = useResource(`search:all:${query}`, () =>
    yt.search(query, "all"),
  );
  const yv = useYouTubeSearch(query, undefined, videos);
  const ytOn = videos && !yv.error;
  // YouTube files music as music; two of its first eight videos being music, or YouTube Music's best
  // match being what you typed, makes this a music search.
  const topMusic = music.data?.top;
  const musical =
    !ytOn ||
    yv.items.slice(0, 8).filter((x) => x.type === "video" && x.music).length >=
      2 ||
    namesMatch(query, topMusic);
  const groups = groupShelves(music.data?.shelves ?? []);
  const top = music.data?.top ?? [...groups.values()][0]?.[0];
  useEffect(() => {
    if (music.data && musical) rememberSearchArt(query, top);
  }, [music.data, musical, query, top]);

  const reload = () => void Promise.all([music.reload(), yv.reload()]);
  if (videos && yv.loading) return <ResultsSkeleton />;
  if (!ytOn && music.loading) return <ResultsSkeleton />;
  if (!ytOn && music.error && !music.data)
    return <ErrorState onRetry={reload} />;

  const rows: Row[] = [];
  const flat = ytOn && !musical;
  if (flat) rows.push(...yv.items.map((item): Row => ({ k: "yt", item })));
  else {
    const part = (c: Kind) =>
      (groups.get(c) ?? []).filter(
        (i) => i.type !== top?.type || i.id !== top?.id,
      );
    const section = (c: Kind, more: boolean, extra: Row[] = []) => {
      const list = part(c).slice(0, PEEK[c as keyof typeof PEEK]);
      if (!list.length && !extra.length) return;
      rows.push({ k: "head", title: SECTION[c], to: more ? c : undefined });
      for (const item of list)
        rows.push(
          item.type === "track" && c === "songs"
            ? { k: "song", item }
            : { k: "item", item },
        );
      rows.push(...extra);
    };
    if (top) rows.push({ k: "top", item: top });
    else if (music.loading) rows.push({ k: "wait", id: "wait:top", n: 1 });
    if (music.loading && !music.data)
      rows.push(
        { k: "head", title: SECTION.songs },
        { k: "wait", id: "wait:songs", n: 3 },
      );
    section("songs", true);
    if (ytOn) {
      const vids = yv.items.filter((x) => x.type === "video");
      if (vids.length) {
        rows.push({ k: "head", title: SECTION.videos, to: "videos" });
        rows.push(
          ...vids.slice(0, PEEK.videos).map((item): Row => ({ k: "yt", item })),
        );
      }
    } else section("videos", false);
    section("albums", true);
    section("artists", true);
    const lists = yv.items.filter((x) => x.type === "playlist").slice(0, 2);
    section(
      "playlists",
      true,
      ytOn ? lists.map((item): Row => ({ k: "yt", item })) : [],
    );
    const chans = yv.items
      .filter((x) => x.type === "channel")
      .slice(0, PEEK.channels);
    if (ytOn && chans.length) {
      rows.push({ k: "head", title: SECTION.channels, to: "channels" });
      rows.push(...chans.map((item): Row => ({ k: "yt", item })));
    }
  }
  if (!rows.length) return <CatState kind="empty" message={EMPTY} />;
  const songs = [...(groups.get("songs") ?? [])];
  return (
    <FlatList
      data={rows}
      keyExtractor={rowId}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={flat ? yv.loadMore : undefined}
      onEndReachedThreshold={0.8}
      contentContainerStyle={{
        paddingTop: flat ? 12 : 0,
        paddingBottom: bottom,
      }}
      ListFooterComponent={
        flat ? (
          <ListFoot
            loading={yv.loadingMore}
            failed={yv.failedMore}
            onRetry={yv.loadMore}
          />
        ) : null
      }
      renderItem={({ item: r }) => {
        switch (r.k) {
          case "top":
            return <TopResult item={r.item} />;
          case "wait":
            return <SkeletonRows count={r.n} />;
          case "head":
            return (
              <SectionHead
                title={r.title}
                accent={accent}
                onMore={r.to ? () => onKind(r.to as Kind) : undefined}
              />
            );
          case "song":
            return <SongRow track={r.item} siblings={songs} />;
          case "item":
            return <ItemRow item={r.item} />;
          case "yt":
            return <YouTubeRow item={r.item} />;
        }
      }}
    />
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { paddingHorizontal: 16, paddingBottom: 6 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: Platform.OS === "android" ? 48 : 44,
    borderRadius: Platform.OS === "android" ? 24 : 13,
    paddingLeft: Platform.OS === "android" ? 16 : 12,
    paddingRight: Platform.OS === "android" ? 12 : 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  fieldOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    paddingVertical: 0,
    height: 44,
    // Android TextInput adds font padding and top-aligns its text inside the taller field.
    ...Platform.select({
      android: {
        height: 48,
        fontSize: 16,
        includeFontPadding: false,
        textAlignVertical: "center" as const,
      },
    }),
  },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  cancel: { fontSize: 17, fontWeight: "500" },
  filterRow: { marginTop: 12, marginHorizontal: -16, flexGrow: 0 },
  filters: { gap: 8, paddingHorizontal: 20 },
  body: { flex: 1 },
  hidden: { display: "none" },
  // Covers the results, under the search field and chips.
  cover: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  recentHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
  },
  recentTitle: { color: "#fff", fontSize: 20, ...display("800") },
  clearAll: { fontSize: 15, fontWeight: "600" },
  ideas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  cell: { width: "48.4%" },
});
