import type { Thumbnail, Track } from "@pawse/music-core";
import { StyleSheet, Text, View } from "react-native";

import {
  askText,
  type SheetAction,
  SheetNote,
  showSheet,
} from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { PlaylistGlyph, PlusGlyph } from "../../components/glyphs";
import { showToast } from "../../components/toast";
import { addToYouTubePlaylist } from "../../data/account";
import { download, isDownloaded } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import type { PlaylistSort } from "../../data/library-model";
import { haptic } from "../../lib/haptics";
import { count } from "../../lib/plural";
import { autoDownloadMode } from "../../lib/settings";
import { display } from "../../lib/type";

// Liked music and episodes for later live elsewhere; they are not playlists you add to.
const NOT_EDITABLE = new Set(["LM", "SE"]);
const bare = (id: string) => (id.startsWith("VL") ? id.slice(2) : id);

/** Every playlist songs can go into: Pawse ones first, then the signed-in account's YouTube Music ones. */
export function showPlaylistPicker(tracks: Track[], o?: { exclude?: string }) {
  if (!tracks.length) return;
  const lib = useLibrary.getState();
  const signedIn = !!lib.settings.cookies;
  const fromYouTube = tracks.some((t) => t.source === "youtube");
  const one = tracks.length === 1 ? tracks[0] : undefined;
  const local = lib.playlists.filter((p) => p.id !== o?.exclude);
  const remote =
    signedIn && fromYouTube
      ? lib.ytPlaylists.filter(
          (p) =>
            !NOT_EDITABLE.has(bare(p.id)) &&
            bare(p.id) !== bare(o?.exclude ?? ""),
        )
      : [];

  const actions: SheetAction[] = [
    {
      label: "New playlist",
      sub: "",
      keepOpen: true,
      icon: (
        <View style={s.tile}>
          <PlusGlyph size={20} weight={2.4} color="#fff" />
        </View>
      ),
      onPress: () =>
        askText({
          title: "New playlist",
          placeholder: "My playlist",
          confirm: "Create",
          onSubmit: (name) => {
            useLibrary.getState().createPlaylist(name, tracks);
            done(tracks, `Made ${name}`, tracks[0]?.thumbnails);
          },
        }),
    },
    ...local.map((p) => {
      const have = new Set(p.tracks.map((t) => t.id));
      const all = tracks.every((t) => have.has(t.id));
      return {
        label: p.title,
        sub: all
          ? one
            ? "Already here"
            : "All already here"
          : `${count(p.tracks.length, "song")} · Pawse`,
        icon: <Cover thumbnails={p.tracks[0]?.thumbnails} />,
        onPress: () => {
          const n = useLibrary.getState().addManyToPlaylist(p.id, tracks);
          if (!n) return showToast(`Already in ${p.title}`);
          done(
            tracks,
            one || n === tracks.length
              ? `Added to ${p.title}`
              : `Added ${count(n, "song")} to ${p.title}`,
            p.tracks[0]?.thumbnails ?? tracks[0]?.thumbnails,
          );
        },
      };
    }),
    ...remote.map((p) => ({
      label: p.title,
      sub: [p.trackCount ? count(p.trackCount, "song") : null, "YouTube Music"]
        .filter(Boolean)
        .join(" · "),
      icon: <Cover thumbnails={p.thumbnails} youtube />,
      onPress: () => {
        addToYouTubePlaylist(p.id, tracks).catch(() =>
          showToast(`YouTube didn't save to ${p.title}. Try again later.`, {
            bad: true,
          }),
        );
        done(tracks, `Added to ${p.title}`, p.thumbnails);
      },
    })),
  ];

  showSheet({
    header: (
      <View>
        <Text style={s.title}>Add to playlist</Text>
        <Text style={s.sub} numberOfLines={1}>
          {one ? one.title : count(tracks.length, "song")}
        </Text>
      </View>
    ),
    actions,
  });
}

function done(tracks: Track[], text: string, thumbnails?: Thumbnail[]) {
  haptic.success();
  showToast(text, { thumbnails });
  // Settings → Download automatically → Liked and playlist songs.
  if (autoDownloadMode() === "all")
    for (const t of tracks) if (!isDownloaded(t.id)) download(t);
}

const SORTS: { by: PlaylistSort; label: string }[] = [
  { by: "added", label: "Date added" },
  { by: "title", label: "Title" },
  { by: "artist", label: "Artist" },
  { by: "plays", label: "Most played" },
];

/** Reorders a Pawse playlist for good; the order stays until it is sorted or moved again. */
export function showSortSheet(id: string) {
  showSheet({
    header: <SheetNote title="Sort playlist" body="The new order is saved." />,
    actions: SORTS.map(({ by, label }) => ({
      label,
      onPress: () => {
        useLibrary.getState().sortPlaylist(id, by);
        haptic.light();
        showToast(`Sorted by ${label.toLowerCase()}`);
      },
    })),
  });
}

export function removeDuplicates(id: string) {
  const n = useLibrary.getState().dedupePlaylist(id);
  if (n) haptic.success();
  showToast(n ? `Removed ${count(n, "repeat")}` : "No repeats here");
}

/** Pulls another Pawse playlist's songs into this one (repeats skipped), then offers to delete the other. */
export function showMergeSheet(id: string) {
  const lib = useLibrary.getState();
  const into = lib.playlists.find((p) => p.id === id);
  if (!into) return;
  const others = lib.playlists.filter((p) => p.id !== id);
  const sources = [
    ...(lib.liked.length
      ? [{ id: "liked", title: "Liked songs", tracks: lib.liked }]
      : []),
    ...others,
  ];
  if (!sources.length)
    return showToast("Make another playlist first, then merge it here");
  showSheet({
    header: (
      <SheetNote
        title={`Merge into ${into.title}`}
        body="Songs already here are skipped."
      />
    ),
    actions: sources.map((p) => ({
      label: p.title,
      sub: count(p.tracks.length, "song"),
      icon: <Cover thumbnails={p.tracks[0]?.thumbnails} />,
      keepOpen: p.id !== "liked",
      onPress: () => {
        const n = useLibrary.getState().addManyToPlaylist(id, p.tracks);
        haptic.success();
        const note = n
          ? `${count(n, "song")} from ${p.title} added`
          : `Everything in ${p.title} was already here`;
        if (p.id === "liked") return showToast(note);
        showSheet({
          header: (
            <SheetNote
              title={note}
              body={`Keep ${p.title} too, or delete it now that its songs live here?`}
            />
          ),
          actions: [
            { label: `Keep ${p.title}`, onPress: () => {} },
            {
              label: `Delete ${p.title}`,
              destructive: true,
              onPress: () => {
                useLibrary.getState().deletePlaylist(p.id);
                showToast(`Deleted ${p.title}`);
              },
            },
          ],
        });
      },
    })),
  });
}

function Cover({
  thumbnails,
  youtube,
}: {
  thumbnails?: Thumbnail[];
  youtube?: boolean;
}) {
  return (
    <View>
      {thumbnails?.length ? (
        <Artwork thumbnails={thumbnails} size={42} radius={8} />
      ) : (
        <View style={s.tile}>
          <PlaylistGlyph size={20} weight={1.8} color="rgba(255,255,255,0.7)" />
        </View>
      )}
      {youtube ? <View style={s.badge} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  title: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    ...display("800"),
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 3,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  // A red corner marks playlists that live in YouTube Music.
  badge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#1C1B22",
    backgroundColor: "#FF2D3F",
  },
});
