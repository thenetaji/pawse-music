import type { PlaylistDetail, Track } from "@studio/music-core";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { ErrorState, Loading } from "../../components/page";
import { useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { Shell } from "./album-page";
import { Collection } from "./collection";

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
          <ErrorState
            message="Couldn't open this playlist"
            onRetry={pl.reload}
          />
        ) : (
          <Loading />
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
    />
  );
}
