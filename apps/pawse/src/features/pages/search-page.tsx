import {
  type ArtistSummary,
  artistLine,
  type CatalogItem,
  type SearchFilter,
  type SearchResults,
  type Shelf as ShelfT,
  type Track,
} from "@pawse/music-core";
import { player } from "@pawse/player";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
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

import { Artwork } from "../../components/artwork";
import { MoodTile } from "../../components/mood-tile";
import { useBottomSpace, useTabRoot } from "../../components/page";
import { openItem, Shelf } from "../../components/shelf";
import { TrackRow } from "../../components/track-row";
import {
  CatState,
  Chip,
  PressScale,
  SectionTitle,
  SkeletonRows,
} from "../../components/ui";
import { useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { useSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";
import { PlayGlyph } from "../now-playing/icons";
import { useAccent } from "../now-playing/now-palette";

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "playlists", label: "Playlists" },
  { id: "videos", label: "Videos" },
];

export default function SearchPage() {
  useTabRoot("search");
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const accent = useAccent();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [focused, setFocused] = useState(false);
  const recent = useLibrary((s) => s.recentSearches);

  const debounced = useDebounced(text.trim(), 180);
  const suggestions = useResource<string[]>(
    focused && debounced ? `sugg:${debounced}` : null,
    () => yt.suggestions(debounced),
  );
  const results = useResource<SearchResults>(
    query ? `search:${filter}:${query}` : null,
    () => yt.search(query, filter),
  );

  const submit = (q: string) => {
    const v = q.trim();
    if (!v) return;
    setText(v);
    setQuery(v);
    setFocused(false);
    Keyboard.dismiss();
    useLibrary.getState().addSearch(v);
  };
  const cancel = () => {
    setText("");
    setQuery("");
    setFocused(false);
    Keyboard.dismiss();
  };

  const typing = focused && !!debounced;
  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        {!focused && !query ? (
          <Animated.Text entering={FadeIn} style={styles.h1}>
            Search
          </Animated.Text>
        ) : null}
        <Animated.View
          layout={LinearTransition.duration(220)}
          style={styles.fieldRow}
        >
          <Pressable
            onPress={() => input.current?.focus()}
            style={[styles.field, focused && styles.fieldOn]}
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
              onFocus={() => setFocused(true)}
              onSubmitEditing={() => submit(text)}
              placeholder="Songs, artists, albums"
              placeholderTextColor="rgba(255,255,255,0.4)"
              returnKeyType="search"
              autoCorrect={false}
              style={styles.input}
              selectionColor={accent}
            />
            {text ? (
              <Pressable
                hitSlop={10}
                onPress={() => {
                  setText("");
                  input.current?.focus();
                }}
                style={styles.clear}
              >
                <Text style={styles.clearText}>×</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {focused || query ? (
            <Animated.View entering={FadeIn.duration(150)}>
              <Pressable hitSlop={8} onPress={cancel}>
                <Text style={[styles.cancel, { color: accent }]}>Cancel</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
        {query && !focused ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                on={filter === f.id}
                accent={accent}
                onPress={() => setFilter(f.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {typing ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottom }}
        >
          {(suggestions.data ?? []).map((s) => (
            <Pressable
              key={s}
              onPress={() => submit(s)}
              style={({ pressed }) => [styles.sugg, pressed && styles.pressed]}
            >
              <Svg
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2.4}
                strokeLinecap="round"
              >
                <Circle cx="11" cy="11" r="7" />
                <Path d="M20 20l-3.5-3.5" />
              </Svg>
              <Text style={styles.suggText} numberOfLines={1}>
                {s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : !query ? (
        <EmptySearch
          recent={recent}
          onPick={submit}
          bottom={bottom}
          accent={accent}
        />
      ) : results.data ? (
        <Results
          data={results.data}
          filter={filter}
          bottom={bottom}
          onFilter={setFilter}
        />
      ) : results.error ? (
        <CatState
          kind="error"
          message="Search didn't go through."
          action="Try again"
          onAction={results.reload}
        />
      ) : (
        <SkeletonRows />
      )}
    </View>
  );
}

type Tile = { title: string; params: string; color?: string };

function EmptySearch({
  recent,
  onPick,
  bottom,
  accent,
}: {
  recent: string[];
  onPick: (q: string) => void;
  bottom: number;
  accent: string;
}) {
  const moods = useResource<Tile[]>("explore:moods", () => yt.moodsAndGenres());
  const ideas = useSearchIdeas();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
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
              <Text style={[styles.clearAll, { color: accent }]}>Clear</Text>
            </Pressable>
          </View>
          {recent.slice(0, 6).map((s) => (
            <Pressable
              key={s}
              onPress={() => onPick(s)}
              style={({ pressed }) => [styles.sugg, pressed && styles.pressed]}
            >
              <Text style={styles.recentIcon}>↺</Text>
              <Text style={styles.suggText} numberOfLines={1}>
                {s}
              </Text>
            </Pressable>
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
  const region = useSetting("region", "IN");
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

const FILTER_BY_TITLE: Record<string, SearchFilter> = {
  songs: "songs",
  videos: "videos",
  albums: "albums",
  artists: "artists",
  playlists: "playlists",
  "community playlists": "playlists",
  "featured playlists": "playlists",
};

function Results({
  data,
  filter,
  bottom,
  onFilter,
}: {
  data: SearchResults;
  filter: SearchFilter;
  bottom: number;
  onFilter: (f: SearchFilter) => void;
}) {
  if (filter !== "all" && data.items)
    return <FilteredResults data={data} bottom={bottom} />;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
      {data.top ? <TopResult item={data.top} /> : null}
      {data.shelves.map((s, i) => {
        const f = FILTER_BY_TITLE[s.title.toLowerCase()];
        return (
          <Shelf
            key={`${s.title}${i}`}
            shelf={s}
            onMore={f ? () => onFilter(f) : undefined}
          />
        );
      })}
    </ScrollView>
  );
}

// One filter tab: pages in more results as you reach the bottom.
function FilteredResults({
  data,
  bottom,
}: {
  data: SearchResults;
  bottom: number;
}) {
  const [more, setMore] = useState<{
    items: CatalogItem[];
    continuation?: string;
    from: SearchResults;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const extra = more?.from === data ? more : null;
  const items = [...(data.items ?? []), ...(extra?.items ?? [])];
  const cont = extra ? extra.continuation : data.continuation;
  const loadMore = () => {
    if (!cont || loading) return;
    setLoading(true);
    yt.searchMore(cont)
      .then((r) =>
        setMore({
          from: data,
          items: [
            ...(extra?.items ?? []),
            ...(r.items ?? r.shelves.flatMap((x) => x.items)),
          ],
          continuation: r.continuation,
        }),
      )
      .catch(() =>
        setMore({
          from: data,
          items: extra?.items ?? [],
          continuation: undefined,
        }),
      )
      .finally(() => setLoading(false));
  };
  if (!items.length)
    return <CatState kind="empty" message="No matches. Try other words." />;
  return (
    <FlatList
      data={items}
      keyExtractor={(i, n) => `${i.id}${n}`}
      onEndReached={loadMore}
      onEndReachedThreshold={0.8}
      contentContainerStyle={{ paddingBottom: bottom, paddingTop: 6 }}
      ListFooterComponent={loading ? <SkeletonRows count={3} /> : null}
      renderItem={({ item }) =>
        item.type === "track" ? (
          <TrackRow
            track={item as Track}
            onPress={() => openItem(item, items)}
          />
        ) : (
          <ItemRow item={item} />
        )
      }
    />
  );
}

// The best match as a hero card with a play button.
function TopResult({ item }: { item: CatalogItem }) {
  const title = item.type === "artist" ? item.name : item.title;
  const kind =
    item.type === "track"
      ? item.kind === "video"
        ? "Video"
        : "Song"
      : item.type === "album"
        ? "Album"
        : item.type === "artist"
          ? "Artist"
          : "Playlist";
  const sub =
    item.type === "track" || item.type === "album"
      ? artistLine(item.artists)
      : item.type === "playlist"
        ? (item.author ?? "")
        : (item.subtitle ?? "");
  const play = () => {
    if (item.type === "track")
      void player.playRadio({ videoId: item.id, title: item.title });
    else openItem(item);
  };
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.topWrap}>
      <PressScale onPress={() => openItem(item)} style={styles.top1}>
        <Artwork
          thumbnails={item.thumbnails}
          size={96}
          radius={item.type === "artist" ? 48 : 12}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.topKind}>Top result · {kind}</Text>
          <Text style={styles.topTitle} numberOfLines={2}>
            {title}
          </Text>
          {sub ? (
            <Text style={styles.topSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <PressScale onPress={play} style={styles.topPlay}>
          <PlayGlyph size={20} color="#000" />
        </PressScale>
      </PressScale>
    </Animated.View>
  );
}

function ItemRow({ item }: { item: CatalogItem }) {
  const round = item.type === "artist";
  const title = item.type === "artist" ? item.name : item.title;
  const sub =
    item.type === "album"
      ? [
          item.kind === "single" ? "Single" : "Album",
          artistLine(item.artists),
          item.year,
        ]
          .filter(Boolean)
          .join(" · ")
      : item.type === "playlist"
        ? ["Playlist", item.author].filter(Boolean).join(" · ")
        : item.type === "artist"
          ? (item.subtitle ?? "Artist")
          : "";
  return (
    <Pressable
      onPress={() => openItem(item)}
      style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
    >
      <Artwork
        thumbnails={item.thumbnails}
        size={56}
        radius={8}
        round={round}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
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
  h1: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 8,
    marginLeft: 4,
    marginBottom: 10,
  },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 13,
    paddingLeft: 12,
    paddingRight: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  fieldOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    paddingVertical: 0,
    height: 44,
  },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  clearText: { color: "#000", fontSize: 15, fontWeight: "800", marginTop: -1 },
  cancel: { fontSize: 17, fontWeight: "500" },
  filterRow: { marginTop: 12, marginHorizontal: -16 },
  filters: { gap: 8, paddingHorizontal: 20 },
  sugg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    height: 50,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 47,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  suggText: { flex: 1, color: "#fff", fontSize: 17 },
  recentHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
  },
  recentTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  clearAll: { fontSize: 15, fontWeight: "600" },
  recentIcon: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 17,
    width: 15,
    textAlign: "center",
  },
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
  tile: {
    height: 78,
    borderRadius: 14,
    padding: 14,
    justifyContent: "flex-end",
  },
  tileText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  topWrap: { paddingHorizontal: 16, marginTop: 12 },
  top1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topKind: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  topTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 3 },
  topSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 2 },
  topPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  itemTitle: { color: "#fff", fontSize: 16, fontWeight: "500" },
  itemSub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
});
