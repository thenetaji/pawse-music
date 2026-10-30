import type { PlaylistDetail, Track } from "@pawse/music-core";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { showToast } from "../../components/toast";
import { CatState, PressScale, SkeletonRows } from "../../components/ui";
import { moveInYouTubePlaylist } from "../../data/account";
import { useOfflineTracks } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { moveItem } from "../../data/library-model";
import { useSmartPlaylists } from "../../data/recommend";
import { yt } from "../../lib/engine";
import { haptic } from "../../lib/haptics";
import { youTubePlaylistActions } from "../../lib/playlist-edit";
import {
  removeFromLiked,
  removeFromLocalPlaylist,
  removeFromYouTubePlaylistWithUndo,
  useRemovedFromYouTube,
} from "../../lib/playlist-remove";
import { count } from "../../lib/plural";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { Shell } from "./album-page";
import { Collection, confirmDelete } from "./collection";

// Liked music and episodes for later are not playlists you remove songs from.
const NOT_EDITABLE = new Set(["LM", "SE"]);

export default function PlaylistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id === "liked" || id.startsWith("local-"))
    return <LocalPlaylist id={id} />;
  if (id === "offline") return <OfflineSongs />;
  if (id.startsWith("smart-")) return <SmartPlaylist id={id.slice(6)} />;
  return <RemotePlaylist id={id} />;
}

function RemotePlaylist({ id }: { id: string }) {
  const pl = useResource<PlaylistDetail>(`playlist:${id}`, () =>
    yt.playlist(id),
  );
  const [more, setMore] = useState<{
    tracks: Track[];
    continuation?: string;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const navigation = useNavigation();
  // The order songs were moved into, shown until YouTube's copy is read again.
  const [moved, setMoved] = useState<Track[] | null>(null);
  // Songs just removed stay off the page while YouTube catches up (and while its copy is still cached).
  const gone = useRemovedFromYouTube(id);
  const p = pl.data;
  if (!p)
    return (
      <Shell>
        {pl.error ? (
          <CatState
            kind="error"
            message="Couldn't open this playlist."
            action="Try again"
            onAction={pl.reload}
          />
        ) : (
          <SkeletonRows />
        )}
      </Shell>
    );
  const loaded = more ? [...p.tracks, ...more.tracks] : p.tracks;
  const movedIds = new Set(moved?.map((t) => t.setVideoId));
  const all = moved
    ? [
        ...moved,
        ...loaded.filter((t) => t.setVideoId && !movedIds.has(t.setVideoId)),
      ]
    : loaded;
  const tracks = gone.length
    ? all.filter((t) => !t.setVideoId || !gone.includes(t.setVideoId))
    : all;
  // Only the owner's playlists come back marked editable, and only when signed in.
  const editable = signedIn && !!p.editable && !NOT_EDITABLE.has(p.id);
  const cont = more ? more.continuation : p.continuation;
  const move = (from: number, to: number) => {
    const track = tracks[from];
    const next = moveItem(tracks, from, to);
    const after = next[to + 1];
    if (!track?.setVideoId || (after && !after.setVideoId))
      return void showToast("This song can't be moved");
    // "To the end" would land past songs that aren't loaded yet.
    if (!after && cont)
      return void showToast(
        "Scroll down to load the rest of the playlist first",
      );
    haptic.tick();
    setMoved(next);
    moveInYouTubePlaylist(p.id, track.setVideoId, after?.setVideoId).catch(
      () => {
        setMoved(null);
        haptic.error();
        showToast("YouTube didn't move the song. Try again later.", {
          bad: true,
        });
      },
    );
  };
  const loadMore = () => {
    if (!cont || loadingMore) return;
    setLoadingMore(true);
    yt.playlistMore(cont)
      .then((r) =>
        setMore((m) => ({
          tracks: [...(m?.tracks ?? []), ...r.tracks],
          continuation: r.continuation,
        })),
      )
      .finally(() => setLoadingMore(false));
  };
  return (
    <Collection
      title={p.title}
      subtitle={p.author}
      meta={
        p.trackCount
          ? count(
              p.trackCount,
              tracks.filter((t) => t.kind === "video").length * 2 >
                tracks.length
                ? "video"
                : "song",
            )
          : undefined
      }
      thumbnails={p.thumbnails}
      tracks={tracks}
      source={{ type: "playlist", id: p.id, title: p.title }}
      ytEdit={
        editable
          ? {
              ...youTubePlaylistActions(p.id, p.title, () => {
                if (navigation.isFocused()) router.back();
              }),
              description: p.description,
              onMove: move,
            }
          : undefined
      }
      onRemove={
        editable
          ? (picks) => removeFromYouTubePlaylistWithUndo(p.id, picks)
          : undefined
      }
      onEndReached={loadMore}
      // Songs added on YouTube show up without waiting for the cache to expire.
      onRefresh={() => {
        setMore(null);
        setMoved(null);
        pl.reload();
      }}
      refreshing={pl.loading}
      footer={loadingMore ? <SkeletonRows count={3} /> : null}
    />
  );
}

// Built from your own listening: Top 50, On repeat, Forgotten favourites and the like.
function SmartPlaylist({ id }: { id: string }) {
  const list = useSmartPlaylists().find((p) => p.id === id);
  const tracks = list?.tracks ?? [];
  return (
    <Collection
      title={list?.title ?? "Playlist"}
      subtitle="Made for you"
      meta={
        list ? `${list.subtitle} · ${count(tracks.length, "song")}` : undefined
      }
      thumbnails={tracks[0]?.thumbnails ?? []}
      tracks={tracks}
      numbered={id === "top50"}
      source={{ type: "library", id: `smart-${id}`, title: list?.title }}
      footer={
        tracks.length ? null : (
          <CatState
            kind="empty"
            message="Play a few more songs and this fills itself in."
          />
        )
      }
    />
  );
}

// Downloads and the songs Pawse kept from your listening: everything that plays with no internet.
function OfflineSongs() {
  const tracks = useOfflineTracks();
  return (
    <Collection
      title="Available offline"
      subtitle="Downloads and songs you play often"
      meta={`${count(tracks.length, "song")}`}
      thumbnails={tracks[0]?.thumbnails ?? []}
      tracks={tracks}
      source={{ type: "library", id: "offline", title: "Available offline" }}
      footer={
        tracks.length ? null : (
          <CatState
            kind="empty"
            message="Songs you finish are kept here so they play without internet."
          />
        )
      }
    />
  );
}

function LocalPlaylist({ id }: { id: string }) {
  const liked = useLibrary((s) => s.liked);
  const local = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const tracks = id === "liked" ? liked : (local?.tracks ?? []);
  const title = id === "liked" ? "Liked songs" : (local?.title ?? "Playlist");
  return (
    <Collection
      title={title}
      subtitle="Pawse"
      meta={`${count(tracks.length, "song")}`}
      thumbnails={tracks[0]?.thumbnails ?? []}
      tracks={tracks}
      source={{ type: "library", id, title }}
      editableId={local ? id : undefined}
      onRemove={
        id === "liked"
          ? removeFromLiked
          : local
            ? (picks) => removeFromLocalPlaylist(id, picks)
            : undefined
      }
      footer={
        tracks.length === 0 ? (
          <CatState
            kind="empty"
            message={
              id === "liked"
                ? "Double-tap the cat on any song to like it."
                : "Add songs from any song's menu."
            }
          />
        ) : local ? (
          <PressScale
            onPress={() =>
              confirmDelete(
                title,
                () => (useLibrary.getState().deletePlaylist(id), router.back()),
              )
            }
            style={styles.delete}
          >
            <Text style={styles.deleteText}>Delete playlist</Text>
          </PressScale>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  delete: {
    alignSelf: "center",
    marginTop: 26,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    backgroundColor: "rgba(255,79,109,0.14)",
  },
  deleteText: { color: "#FF4F6D", fontSize: 15, ...display("700") },
});
