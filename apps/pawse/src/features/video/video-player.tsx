import { useVideoPlayer, VideoView } from "expo-video";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type VideoHandle = { seek(sec: number): void; replay(): void };

type Props = {
  uri: string;
  /** Shown until the first frame (web only; native players show their own). */
  poster?: string;
  /** Where to begin, seconds (opening a song's video where the song was). */
  startAt?: number;
  style?: StyleProp<ViewStyle>;
  onEnd?: () => void;
  onTime?: (sec: number) => void;
  onError?: (message: string) => void;
};

/** The system's own video player (AVPlayer, ExoPlayer) with its controls, full screen and picture in picture. */
export const VideoPlayer = forwardRef<VideoHandle, Props>(function VideoPlayer(
  { uri, startAt, style, onEnd, onTime, onError },
  ref,
) {
  const cb = useRef({ onEnd, onTime, onError });
  cb.current = { onEnd, onTime, onError };
  const player = useVideoPlayer({ uri, contentType: "hls" }, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 0.5;
    if (startAt) p.currentTime = startAt;
    p.play();
  });
  useEffect(() => {
    const subs = [
      player.addListener("playToEnd", () => cb.current.onEnd?.()),
      player.addListener("timeUpdate", (e) =>
        cb.current.onTime?.(e.currentTime),
      ),
      player.addListener("statusChange", (e) => {
        if (e.status === "error")
          cb.current.onError?.(e.error?.message ?? "Couldn't play this video");
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);
  useImperativeHandle(
    ref,
    () => ({
      seek: (sec) => {
        player.currentTime = sec;
        player.play();
      },
      replay: () => {
        player.currentTime = 0;
        player.play();
      },
    }),
    [player],
  );
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      contentFit="contain"
      allowsPictureInPicture
      startsPictureInPictureAutomatically
      fullscreenOptions={{ enable: true }}
    />
  );
});
