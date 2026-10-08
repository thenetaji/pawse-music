import type {
  CatalogItem,
  SearchFilter,
  SearchResults,
  Track,
} from "@studio/music-core";
import { useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { Artwork } from "../../components/artwork";
import {
  ErrorState,
  Loading,
  useBottomSpace,
  useTabRoot,
} from "../../components/page";
import { Card, openItem, Shelf } from "../../components/shelf";
import { TrackRow } from "../../components/track-row";
import { useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
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
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [typing, setTyping] = useState(false);
  const recent = useLibrary((s) => s.recentSearches);

  const debounced = useDebounced(text.trim(), 180);
  const suggestions = useResource<string[]>(
    typing && debounced ? `sugg:${debounced}` : null,
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
    setTyping(false);
    Keyboard.dismiss();
    useLibrary.getState().addSearch(v);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.h1}>Search</Text>
        <View style={styles.field}>
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={2.4}
            strokeLinecap="round"
          >
            <Circle cx="11" cy="11" r="7" />
            <Path d="M20 20l-3.5-3.5" />
          </Svg>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setTyping(true);
            }}
            onFocus={() => setTyping(true)}
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
              onPress={() => (setText(""), setQuery(""), setTyping(true))}
            >
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {query && !typing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[
                  styles.filter,
                  filter === f.id && { backgroundColor: accent },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === f.id && { color: "#000" },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {typing || !query ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottom }}
        >
          {(debounced ? (suggestions.data ?? []) : recent).map((s) => (
            <Pressable
              key={s}
              onPress={() => submit(s)}
              style={({ pressed }) => [
                styles.sugg,
                pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
              ]}
            >
              <Text style={styles.suggText} numberOfLines={1}>
                {s}
              </Text>
            </Pressable>
          ))}
          {!debounced && recent.length ? (
            <Pressable
              onPress={() => useLibrary.getState().clearSearches()}
              style={styles.sugg}
            >
              <Text style={[styles.suggText, { color: accent, fontSize: 15 }]}>
                Clear recent
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : results.data ? (
        <Results data={results.data} filter={filter} bottom={bottom} />
      ) : results.error ? (
        <ErrorState message="Search failed" onRetry={results.reload} />
      ) : (
        <Loading />
      )}
    </View>
  );
}

function Results({
  data,
  filter,
  bottom,
}: {
  data: SearchResults;
  filter: SearchFilter;
  bottom: number;
}) {
  if (filter !== "all" && data.items) {
    const items = data.items;
    return (
      <FlatList
        data={items}
        keyExtractor={(i, n) => `${i.id}${n}`}
        contentContainerStyle={{ paddingBottom: bottom, paddingTop: 6 }}
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
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
      {data.top ? (
        <View style={styles.topResult}>
          <Text style={styles.kicker}>Top result</Text>
          <Card item={data.top} size={170} />
        </View>
      ) : null}
      {data.shelves.map((s, i) => (
        <Shelf key={`${s.title}${i}`} shelf={s} />
      ))}
    </ScrollView>
  );
}

function ItemRow({ item }: { item: CatalogItem }) {
  const round = item.type === "artist";
  const title = item.type === "artist" ? item.name : item.title;
  const sub =
    item.type === "album"
      ? [
          item.kind === "single" ? "Single" : "Album",
          item.artists.map((a) => a.name).join(", "),
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
      style={({ pressed }) => [
        styles.itemRow,
        pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
      ]}
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
  top: { paddingHorizontal: 20, paddingBottom: 8 },
  h1: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  input: { flex: 1, color: "#fff", fontSize: 17, height: 44 },
  clear: { color: "rgba(255,255,255,0.5)", fontSize: 15, fontWeight: "700" },
  filters: { gap: 8, marginTop: 12 },
  filter: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  filterText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  sugg: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  suggText: { color: "#fff", fontSize: 17 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  itemTitle: { color: "#fff", fontSize: 16, fontWeight: "500" },
  itemSub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  topResult: { paddingHorizontal: 20, marginTop: 14 },
  kicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
});
