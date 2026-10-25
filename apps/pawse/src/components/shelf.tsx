import {
  artistLine,
  type CatalogItem,
  type Shelf as ShelfT,
  type Track,
} from "@pawse/music-core";
import { player } from "@pawse/player";
import {
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLibrary } from "../data/library";
import { isPinned, togglePin } from "../data/pins";
import { showTrackActions } from "../features/library/track-actions";
import { rightClick } from "../lib/context-menu";
import { useContentWidth } from "../lib/layout";
import { go } from "../lib/nav";
import { autoplayMode } from "../lib/settings";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import { Artwork } from "./artwork";
import { ArtistGlyph, PinGlyph, PlusGlyph, ShareGlyph } from "./glyphs";
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
    radio: autoplayMode() !== "off",
    source: { type: "other" },
  });
}

/** Long press on an album, artist or playlist: save or follow, pin to Home, share. */
export function showItemActions(item: CatalogItem) {
  if (item.type === "track") return showTrackActions(item);
  const lib = useLibrary.getState();
  const title = item.type === "artist" ? item.name : item.title;
  const link =
    item.type === "album"
      ? `https://music.youtube.com/browse/${item.id}`
      : item.type === "artist"
        ? `https://music.youtube.com/channel/${item.id}`
        : `https://music.youtube.com/playlist?list=${item.id}`;
  const keep =
    item.type === "album"
      ? {
          label: lib.isAlbumSaved(item.id)
            ? "Remove from Library"
            : "Save to Library",
          icon: (c: string) => <PlusGlyph size={22} color={c} />,
          onPress: () => void lib.toggleSaveAlbum(item),
        }
      : item.type === "artist"
        ? {
            label: lib.isFollowing(item.id) ? "Unfollow" : "Follow",
            icon: (c: string) => <ArtistGlyph size={22} color={c} />,
            onPress: () => void lib.toggleFollowArtist(item),
          }
        : undefined;
  showSheet({
    header: (
      <View style={styles.sheetHead}>
        <Artwork
          thumbnails={item.thumbnails}
          size={48}
          radius={8}
          round={item.type === "artist"}
          seed={title}
        />
        <Text style={styles.sheetTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
    ),
    actions: [
      ...(keep ? [keep] : []),
      {
        label: isPinned(item.id) ? "Unpin from Home" : "Pin to Home",
        icon: (c) => <PinGlyph size={22} color={c} />,
        onPress: () =>
          togglePin({
            kind: item.type,
            id: item.id,
            title,
            thumbnails: item.thumbnails,
          }),
      },
      {
        label: "Share",
        icon: (c) => <ShareGlyph size={22} color={c} />,
        onPress: () =>
          void Share.share(
            Platform.OS === "ios" ? { url: link } : { message: link },
          ),
      },
    ],
  });
}

/** A shelf's "›": playlists open as playlists (artist Top songs), the rest as a See all page. */
export function openMore(shelf: ShelfT) {
  if (!shelf.more) return;
  const [browseId] = shelf.more.split("|");
  if (browseId.startsWith("VL")) return go(`/playlist/${browseId.slice(2)}`);
  go(
    `/more/${encodeURIComponent(shelf.more)}?title=${encodeURIComponent(shelf.title)}`,
  );
}

export function Shelf({
  shelf,
  onMore,
  removable,
}: {
  shelf: ShelfT;
  onMore?: () => void;
  /** On Home, song menus offer removing the song. */
  removable?: boolean;
}) {
  const tracks = shelf.items.filter((i) => i.type === "track");
  const onlyTracks = tracks.length === shelf.items.length && tracks.length > 0;
  return (
    <View style={styles.shelf}>
      <Pressable
        disabled={!shelf.more && !onMore}
        onPress={onMore ?? (() => openMore(shelf))}
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
        <TrackGrid items={shelf.items} removable={removable} />
      ) : (
        <Cards items={shelf.items} removable={removable} />
      )}
    </View>
  );
}

// Quick picks: four rows per page, swiped sideways like a deck.
function TrackGrid({
  items,
  removable,
}: {
  items: CatalogItem[];
  removable?: boolean;
}) {
  const pages: CatalogItem[][] = [];
  for (let i = 0; i < items.length; i += 4) pages.push(items.slice(i, i + 4));
  // One page per screen width with the next peeking in; wide windows show columns side by side.
  const width = useContentWidth();
  const PAGE_W = width > 700 ? Math.min(420, (width - 40) / 2) : width - 44;
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
              swipeable={false}
              removable={removable}
            />
          ))}
        </View>
      )}
    />
  );
}

function Cards({
  items,
  removable,
}: {
  items: CatalogItem[];
  removable?: boolean;
}) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(i, n) => `${i.type}${i.id}${n}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
      renderItem={({ item }) => (
        <Card
          item={item}
          siblings={items}
          size={item.type === "artist" ? 110 : undefined}
          removable={removable}
        />
      )}
    />
  );
}

export function Card({
  item,
  siblings,
  size = CARD,
  removable,
}: {
  item: CatalogItem;
  siblings?: CatalogItem[];
  size?: number;
  removable?: boolean;
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
      onLongPress={() =>
        item.type === "track"
          ? showTrackActions(item, { removable })
          : showItemActions(item)
      }
      {...rightClick(() =>
        item.type === "track"
          ? showTrackActions(item, { removable })
          : showItemActions(item),
      )}
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
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { flex: 1, color: "#fff", fontSize: 16, ...display("800") },
  shelf: { marginTop: 26 },
  head: { paddingHorizontal: 20, marginBottom: 10 },
  kicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    ...display("700"),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    ...display("800"),
    letterSpacing: -0.4,
  },
  chev: { color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 8 },
  cardSub: { color: "rgba(255,255,255,0.5)", fontSize: 12.5, marginTop: 2 },
  center: { textAlign: "center" },
});
