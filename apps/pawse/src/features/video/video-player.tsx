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
  /** A small still of the playing picture every few seconds, for the ambient glow (web only). */
  onFrame?: (uri: string) => void;
  /** The picture height (and frame rate) now playing, as Auto moves between qualities. */
  onTrack?: (height: number, fps?: number) => void;
  /** Sent with every media request (phones; computers go through the relay). */
  headers?: Record<string, string>;
};

/** The system's own video player (AVPlayer, ExoPlayer) with its controls, full screen and picture in picture. */
export const VideoPlayer = forwardRef<VideoHandle, Props>(function VideoPlayer(
  { uri, startAt, style, onEnd, onTime, onError, onTrack, headers },
  ref,
) {
  const cb = useRef({ onEnd, onTime, onError, onTrack });
  cb.current = { onEnd, onTime, onError, onTrack };
  const player = useVideoPlayer({ uri, contentType: "hls", headers }, (p) => {
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
      player.addListener("videoTrackChange", (e) => {
        const h = e.videoTrack?.size.height;
        if (h) cb.current.onTrack?.(h, e.videoTrack?.frameRate ?? undefined);
      }),
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
