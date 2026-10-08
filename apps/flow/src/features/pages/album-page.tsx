import { artistLine, type AlbumDetail } from "@studio/music-core";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { ErrorState, Loading } from "../../components/page";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { BackButton, Collection } from "./collection";

export default function AlbumPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = useResource<AlbumDetail>(`album:${id}`, () => yt.album(id));
  const a = album.data;
  if (!a)
    return (
      <Shell>
        {album.error ? (
          <ErrorState
            message="Couldn't open this album"
            onRetry={album.reload}
          />
        ) : (
          <Loading />
        )}
      </Shell>
    );
  const mins = Math.round(
    (a.totalDurationSec ??
      a.tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0)) / 60,
  );
  const kind =
    a.kind === "single" ? "Single" : a.kind === "ep" ? "EP" : "Album";
  return (
    <Collection
      title={a.title}
      subtitle={artistLine(a.artists)}
      meta={[
        kind,
        a.year,
        `${a.tracks.length} songs`,
        mins ? `${mins} min` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      thumbnails={a.thumbnails}
      tracks={a.tracks.map((t) => ({
        ...t,
        thumbnails: t.thumbnails.length ? t.thumbnails : a.thumbnails,
        album: t.album ?? { id: a.id, title: a.title },
      }))}
      source={{ type: "album", id: a.id, title: a.title }}
      numbered
    />
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {children}
      <BackButton />
    </View>
  );
}
