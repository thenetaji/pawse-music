import type { PlaylistDetail, Track } from "@studio/music-core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { CatState, PressScale, SkeletonRows } from "../../components/ui";
import { useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { Shell } from "./album-page";
import { Collection, confirmDelete } from "./collection";

export default function PlaylistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id === "liked" || id.startsWith("local-"))
    return <LocalPlaylist id={id} />;
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
  const tracks = more ? [...p.tracks, ...more.tracks] : p.tracks;
  const cont = more ? more.continuation : p.continuation;
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
      meta={p.trackCount ? `${p.trackCount} songs` : undefined}
      thumbnails={p.thumbnails}
      tracks={tracks}
      source={{ type: "playlist", id: p.id, title: p.title }}
      onEndReached={loadMore}
      footer={loadingMore ? <SkeletonRows count={3} /> : null}
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
      subtitle="Flow"
      meta={`${tracks.length} songs`}
      thumbnails={tracks[0]?.thumbnails ?? []}
      tracks={tracks}
      source={{ type: "library", id, title }}
      editableId={local ? id : undefined}
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
  deleteText: { color: "#FF4F6D", fontSize: 15, fontWeight: "700" },
});
