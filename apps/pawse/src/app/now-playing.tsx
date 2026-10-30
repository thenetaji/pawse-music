import type { Lyrics } from "@pawse/music-core";
import {
  emitPlayerEvent,
  getProgress,
  player,
  usePlayerSelect,
} from "@pawse/player";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CatState } from "../components/ui";
import { localVideo } from "../data/downloads";
import { useLibrary } from "../data/library";
import {
  shareLyric,
  showTrackActions,
} from "../features/library/track-actions";
import { NowPlayingView } from "../features/now-playing/now-playing-view";
import { openWatch } from "../features/watch/store";
import { logEvent } from "../lib/diagnostics";
import { lyricsService } from "../lib/engine";
import { push } from "../lib/nav";
import { setSetting, useSetting } from "../lib/settings";
import { openAlbum, openArtist } from "../lib/song-links";
import { useSongVideo } from "../lib/song-video";
import { useResource } from "../lib/use-resource";
import { useSettled } from "../lib/use-settled";
import { mutedVideo } from "../lib/video-stream";

const LABEL = {
  album: "Playing from album",
  playlist: "Playing from playlist",
  artist: "Playing from artist",
  radio: "Playing from radio",
  search: "Playing from search",
  library: "Playing from library",
  other: "Now playing",
} as const;

// Close the player first, then open the page inside the current tab.
const leavePlayer = (fn: () => void) => {
  router.back();
  setTimeout(fn, 250);
};

export default function NowPlaying() {
  // Status and progress are read by the small parts that show them, not by the whole screen.
  const current = usePlayerSelect((s) => s.current);
  const source = usePlayerSelect((s) => s.source);
  const watch = useSetting("videos", true);
  const liked = useLibrary((s) =>
    current ? s.liked.some((t) => t.id === current.id) : false,
  );
  // The desktop player bar can open straight into lyrics.
  const start = useLocalSearchParams<{ mode?: string }>().mode;
  const [mode, setMode] = useState<"art" | "lyrics">(
    start === "lyrics" ? "lyrics" : "art",
  );
  // Lyrics wait until the sheet has finished sliding up, so parsing them never lands in its frames.
  const settled = useSettled();
  const lyrics = useResource<Lyrics | null>(
    current && (settled || mode === "lyrics") ? `lyrics:${current.id}` : null,
    () => lyricsService.lyrics(current!),
  );
  // Song | Video: the switch remembers its side from song to song.
  const inPlayer = useSetting("videoInPlayer", true);
  const npVideo = useSetting("npVideo", false);
  // A downloaded video opens on its picture; the switch still flips it, for this one only.
  const saved = !!current && !!localVideo(current.id);
  const [pick, setPick] = useState<{ id: string; on: boolean }>();
  const videoOn = pick && pick.id === current?.id ? pick.on : npVideo || saved;
  const canVideo =
    watch && (inPlayer || saved) && current?.source === "youtube";
  // A song's picture is its official music video; null when it has none.
  const songVideo = useSongVideo(
    watch && current?.source === "youtube" ? current : undefined,
  );
  const videoId = canVideo && videoOn ? (songVideo ?? undefined) : undefined;
  const muted = useResource<string>(videoId ? `muted:${videoId}` : null, () =>
    mutedVideo(videoId!, 480).catch((e: Error) => {
      logEvent("video-failed", `${videoId} (player): ${e.message}`);
      throw e;
    }),
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
      onQueue={() => push("/queue")}
      onClose={() => router.back()}
      onMore={() => current && showTrackActions(current, { fromPlayer: true })}
      video={
        canVideo
          ? {
              on: videoOn,
              uri: muted.data ?? undefined,
              failed: !!muted.error,
              none: songVideo === null,
              onChange: (on) => {
                setPick({ id: current.id, on });
                if (!saved) setSetting("npVideo", on);
              },
            }
          : undefined
      }
      onVideo={
        watch && current.source === "youtube" && songVideo
          ? () => {
              const at = Math.floor(getProgress().position);
              leavePlayer(() =>
                openWatch(
                  {
                    id: songVideo,
                    title: current.title,
                    thumbnails: current.thumbnails,
                  },
                  at,
                ),
              );
            }
          : undefined
      }
      onTitle={() => current && void openAlbum(current, leavePlayer)}
      onArtist={() => current && void openArtist(current, leavePlayer)}
      onShareLyric={(line) => current && shareLyric(current, line)}
    />
  );
}
