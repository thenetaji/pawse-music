import {
  artistLine,
  type CatalogItem,
  type Shelf as ShelfT,
  type Track,
} from "@studio/music-core";
import { go } from "../lib/nav";
import { player } from "@studio/player";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { showTrackActions } from "../features/library/track-actions";
import { Artwork } from "./artwork";
import { TrackRow } from "./track-row";

const CARD = 152;

export function openItem(item: CatalogItem, siblings?: CatalogItem[]) {
  if (item.type === "album") return go(`/album/${item.id}`);
  if (item.type === "artist") return go(`/artist/${item.id}`);
  if (item.type === "playlist") return go(`/playlist/${item.id}`);
  const tracks = (siblings ?? [item]).filter(
    (i): i is Extract<CatalogItem, { type: "track" }> => i.type === "track",
  );
  const at = Math.max(
    0,
    tracks.findIndex((t) => t.id === item.id),
  );
  // A single song from a mixed shelf starts its radio, so the music never stops.
  if (tracks.length <= 1)
    return void player.playRadio({ videoId: item.id, title: item.title });
  void player.play(tracks as Track[], at, {
    radio: true,
    source: { type: "other" },
  });
}

export function Shelf({
  shelf,
  onMore,
}: {
  shelf: ShelfT;
  onMore?: () => void;
}) {
  const tracks = shelf.items.filter((i) => i.type === "track");
  const onlyTracks = tracks.length === shelf.items.length && tracks.length > 0;
  return (
    <View style={styles.shelf}>
      <Pressable
        disabled={!shelf.more && !onMore}
        onPress={onMore}
        style={styles.head}
      >
        {shelf.subtitle ? (
          <Text style={styles.kicker}>{shelf.subtitle}</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {shelf.title}
          {shelf.more || onMore ? <Text style={styles.chev}> ›</Text> : null}
        </Text>
      </Pressable>
      {onlyTracks && tracks.length > 4 ? (
        <TrackGrid items={shelf.items} />
      ) : (
        <Cards items={shelf.items} />
      )}
    </View>
  );
}

// Quick picks: four rows per page, swiped sideways like a deck.
function TrackGrid({ items }: { items: CatalogItem[] }) {
  const pages: CatalogItem[][] = [];
  for (let i = 0; i < items.length; i += 4) pages.push(items.slice(i, i + 4));
  return (
    <FlatList
      horizontal
      data={pages}
      keyExtractor={(_, i) => String(i)}
      showsHorizontalScrollIndicator={false}
      snapToInterval={PAGE_W}
      decelerationRate="fast"
      contentContainerStyle={{ paddingRight: 20 }}
      renderItem={({ item: page }) => (
        <View style={{ width: PAGE_W }}>
          {page.map((t) => (
            <TrackRow
              key={t.id}
              track={t as Track}
              onPress={() => openItem(t, items)}
            />
          ))}
        </View>
      )}
    />
  );
}
const PAGE_W = 340;

function Cards({ items }: { items: CatalogItem[] }) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(i, n) => `${i.type}${i.id}${n}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
      renderItem={({ item }) => <Card item={item} siblings={items} />}
    />
  );
}

export function Card({
  item,
  siblings,
  size = CARD,
}: {
  item: CatalogItem;
  siblings?: CatalogItem[];
  size?: number;
}) {
  const round = item.type === "artist";
  const title = item.type === "artist" ? item.name : item.title;
  const sub =
    item.type === "track"
      ? artistLine(item.artists)
      : item.type === "album"
        ? [
            item.kind === "single"
              ? "Single"
              : item.kind === "ep"
                ? "EP"
                : "Album",
            artistLine(item.artists),
            item.year,
          ]
            .filter(Boolean)
            .join(" · ")
        : item.type === "playlist"
          ? (item.author ?? "Playlist")
          : (item.subtitle ?? "Artist");
  const wide = item.type === "track" && item.kind === "video";
  return (
    <Pressable
      onPress={() => openItem(item, siblings)}
      onLongPress={
        item.type === "track" ? () => showTrackActions(item) : undefined
      }
      style={({ pressed }) => [
        { width: wide ? size * 1.6 : size },
        pressed && { opacity: 0.7 },
      ]}
    >
      {wide ? (
        <View
          style={{
            width: size * 1.6,
            height: size,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <Artwork
            thumbnails={item.thumbnails}
            size={size * 1.6}
            radius={10}
            style={{ height: size }}
          />
        </View>
      ) : (
        <Artwork
          thumbnails={item.thumbnails}
          size={size}
          radius={round ? 0 : 10}
          round={round}
        />
      )}
      <Text
        style={[styles.cardTitle, round && styles.center]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[styles.cardSub, round && styles.center]} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: { marginTop: 26 },
  head: { paddingHorizontal: 20, marginBottom: 10 },
  kicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  chev: { color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 8 },
  cardSub: { color: "rgba(255,255,255,0.5)", fontSize: 12.5, marginTop: 2 },
  center: { textAlign: "center" },
});
