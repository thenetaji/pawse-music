import {
  useVideoPlayer,
  type VideoPlayer,
  type VideoSource,
  VideoView,
} from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";

/** What the player hands to a VideoSurface: the native player object (a <video> element on the web). */
export type SurfaceRef = VideoPlayer;

export interface WatchPlayer {
  surface: SurfaceRef;
  seek(sec: number): void;
  replay(): void;
  toggle(): void;
  pause(): void;
  /** Playback speed, 1 = normal. */
  setRate(rate: number): void;
}

// The page's own full-screen button reaches the one surface on screen through this.
let enterFull: (() => void) | undefined;
/** Shows the video full screen, with the system's own controls there. */
export const enterFullscreen = () => enterFull?.();

export interface WatchPlayerOptions {
  uri?: string;
  headers?: Record<string, string>;
  /** Seconds to start from each time the source changes. */
  startAt?: number;
  onTime?: (sec: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** The picture height (and frame rate) now playing, as Auto moves between qualities. */
  onTrack?: (height: number, fps?: number) => void;
  onPlaying?: (playing: boolean) => void;
  /** A small still for the ambient glow (web only). */
  onFrame?: (uri: string) => void;
}

// Outside the component: the compiler treats the hook's player as read-only.
async function load(p: VideoPlayer, src: VideoSource, start?: number) {
  await p.replaceAsync(src);
  if (start) p.currentTime = start;
  p.play();
}
const seekTo = (p: VideoPlayer, sec: number) => {
  p.currentTime = sec;
  p.play();
};
const setRate = (p: VideoPlayer, r: number) => {
  p.playbackRate = r;
};
const setup = (p: VideoPlayer) => {
  p.staysActiveInBackground = true;
  p.showNowPlayingNotification = true;
  p.timeUpdateEventInterval = 0.5;
};

/** One video player for a whole watch session: the full page and the mini player both show it. */
export function useWatchPlayer(o: WatchPlayerOptions): WatchPlayer {
  const cb = useRef(o);
  // The latest callbacks, for events; declared first so the load below sees this render's startAt.
  useEffect(() => {
    cb.current = o;
  });
  const player = useVideoPlayer(null, setup);
  useEffect(() => {
    if (!o.uri) return;
    let live = true;
    load(
      player,
      { uri: o.uri, contentType: "hls", headers: o.headers },
      cb.current.startAt,
    ).catch((e: Error) => live && cb.current.onError?.(e.message));
    return () => {
      live = false;
    };
    // Reloads only for a new playlist (a new video or quality); the headers come with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, o.uri]);
  useEffect(() => {
    const subs = [
      player.addListener("playToEnd", () => cb.current.onEnd?.()),
      player.addListener("timeUpdate", (e) =>
        cb.current.onTime?.(e.currentTime),
      ),
      player.addListener("playingChange", (e) =>
        cb.current.onPlaying?.(e.isPlaying),
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
  return useMemo(
    () => ({
      surface: player,
      seek: (sec: number) => seekTo(player, sec),
      replay: () => seekTo(player, 0),
      toggle: () => (player.playing ? player.pause() : player.play()),
      pause: () => player.pause(),
      setRate: (r: number) => setRate(player, r),
    }),
    [player],
  );
}

/** Shows the session's video. Only one surface is on screen at a time: the full page or the mini player. */
export function VideoSurface({
  surface,
  controls,
  style,
}: {
  surface: SurfaceRef;
  controls?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const view = useRef<VideoView>(null);
  // The page draws its own controls; full screen uses the system's.
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!controls) return;
    enterFull = () => {
      setFull(true);
      requestAnimationFrame(() => void view.current?.enterFullscreen());
    };
    return () => {
      enterFull = undefined;
    };
  }, [controls]);
  return (
    <VideoView
      ref={view}
      player={surface}
      style={style}
      nativeControls={full}
      contentFit="contain"
      allowsPictureInPicture
      startsPictureInPictureAutomatically
      fullscreenOptions={{ enable: true }}
      onFullscreenExit={() => setFull(false)}
    />
  );
}
