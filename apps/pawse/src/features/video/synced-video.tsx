import { getProgress, usePlayerStore } from "@pawse/player";
import { useVideoPlayer, type VideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";

import { reclaimNowPlaying } from "../playback/now-playing-guard";

// Closer than this and the picture is left alone; a nudge every half second keeps lips in time.
const DRIFT_SEC = 0.35;
const TICK_MS = 500;
// A seek needs a moment to land before drift means anything again.
const SETTLE_MS = 2000;

// Outside the component: the compiler treats the hook's player as read-only.
const seek = (p: VideoPlayer, sec: number) => {
  p.currentTime = sec;
};

/** A song's video with no sound, following the music player: it plays, pauses and seeks along with the song. */
export function SyncedVideo({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  // A downloaded picture is a plain mp4 file; online it's a playlist.
  const contentType = uri.startsWith("file:") ? "progressive" : "hls";
  const video = useVideoPlayer({ uri, contentType }, (p) => {
    p.muted = true;
    // iOS: "mix" would cost the song its Dynamic Island and lock screen; it's one app, so nothing is taken.
    // Android: mixing keeps the music's audio focus.
    p.audioMixingMode = Platform.OS === "ios" ? "doNotMix" : "mixWithOthers";
  });
  useEffect(() => {
    let seekedAt = 0;
    const tick = () => {
      const st = usePlayerStore.getState().status;
      const on = st === "playing";
      const pos = getProgress().position;
      if (
        Date.now() - seekedAt > SETTLE_MS &&
        Math.abs(video.currentTime - pos) > DRIFT_SEC
      ) {
        seek(video, pos);
        seekedAt = Date.now();
      }
      if (on && !video.playing) video.play();
      if (!on && video.playing) video.pause();
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      // The player is released with this view, and that resets the audio session.
      reclaimNowPlaying();
    };
  }, [video]);
  return (
    <VideoView
      player={video}
      style={style}
      nativeControls={false}
      contentFit="contain"
      allowsPictureInPicture={false}
    />
  );
}
