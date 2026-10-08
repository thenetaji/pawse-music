import type { Lyrics } from "@studio/music-core";
import {
  emitPlayerEvent,
  player,
  usePlayerState,
  useProgress,
} from "@studio/player";
import { router } from "expo-router";
import { useState } from "react";

import { View } from "react-native";

import { CatState } from "../components/ui";
import { useLibrary } from "../data/library";
import {
  shareLyric,
  showTrackActions,
} from "../features/library/track-actions";
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

  if (!current)
    return (
      <View
        style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}
      >
        <CatState
          kind="empty"
          message="Nothing is playing. Pick a song and the cat starts dancing."
          action="Close"
          onAction={() => router.back()}
        />
      </View>
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
      onMore={() => current && showTrackActions(current, { fromPlayer: true })}
      onShareLyric={(line) => current && shareLyric(current, line)}
    />
  );
}
