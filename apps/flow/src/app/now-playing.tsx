import type { Lyrics } from "@studio/music-core";
import {
  emitPlayerEvent,
  player,
  usePlayerState,
  useProgress,
} from "@studio/player";
import { router } from "expo-router";
import { useState } from "react";

import { useLibrary } from "../data/library";
import { NowPlayingView } from "../features/now-playing/now-playing-view";
import { lyricsService } from "../lib/engine";
import { useResource } from "../lib/use-resource";

const LABEL = {
  album: "Playing from album",
  playlist: "Playing from playlist",
  artist: "Playing from artist",
  radio: "Playing from radio",
  search: "Playing from search",
  library: "Playing from library",
  other: "Now playing",
} as const;

export default function NowPlaying() {
  const { current, status, source } = usePlayerState();
  const { position, duration } = useProgress();
  const liked = useLibrary((s) =>
    current ? s.liked.some((t) => t.id === current.id) : false,
  );
  const [mode, setMode] = useState<"art" | "lyrics">("art");
  const lyrics = useResource<Lyrics | null>(
    current ? `lyrics:${current.id}` : null,
    () => lyricsService.lyrics(current!),
  );

  return (
    <NowPlayingView
      track={current}
      status={status}
      position={position}
      duration={duration || current?.durationSec || 0}
      lyrics={lyrics.data}
      lyricsLoading={lyrics.loading}
      mode={mode}
      liked={liked}
      context={
        source ? { label: LABEL[source.type], title: source.title } : undefined
      }
      onToggle={() => player.toggle()}
      onNext={() => player.next()}
      onPrev={() => player.previous()}
      onSeek={(s) => player.seekTo(s)}
      onLike={() => {
        if (!current) return;
        if (useLibrary.getState().toggleLike(current))
          emitPlayerEvent("liked", current);
      }}
      onLyrics={() => setMode((m) => (m === "lyrics" ? "art" : "lyrics"))}
      onQueue={() => router.push("/queue")}
      onClose={() => router.back()}
    />
  );
}
