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
  /** Moves to a time; a paused video stays paused unless `play` (a chapter, a timestamp). */
  seek(sec: number, play?: boolean): void;
  replay(): void;
  toggle(): void;
  pause(): void;
  /** Playback speed, 1 = normal. */
  setRate(rate: number): void;
  /** Seconds played, read at the moment it's asked. */
  time(): number;
}

// How long a new view waits for its first frame before a paused picture is redrawn.
const REDRAW_MS = 250;

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
  /** Waiting for more of the video after it started: a stall, a seek, a quality change. */
  onBuffering?: (waiting: boolean) => void;
  /** What the lock screen and Control Center show for the video. */
  meta?: { title?: string; artist?: string; artwork?: string };
  /** A small still for the ambient glow (web only). */
  onFrame?: (uri: string) => void;
}

// Outside the component: the compiler treats the hook's player as read-only.
// iOS puts a player back to normal speed whenever it starts playing, so the chosen speed is kept here.
const rates = new WeakMap<VideoPlayer, number>();
const start = (p: VideoPlayer) => {
  p.play();
  const r = rates.get(p);
  if (r && r !== 1) p.playbackRate = r;
};
async function load(p: VideoPlayer, src: VideoSource, at?: number) {
  await p.replaceAsync(src);
  if (at) p.currentTime = at;
  start(p);
}
const seekTo = (p: VideoPlayer, sec: number, play?: boolean) => {
  // At the end the video has stopped; moving back means watching again.
  const over = !!p.duration && p.currentTime >= p.duration - 0.5;
  p.currentTime = sec;
  if (play || over) start(p);
};
const setRate = (p: VideoPlayer, r: number) => {
  rates.set(p, r);
  p.playbackRate = r;
};
// A view put on a paused player (full page, full screen, mini player) can come up black until the
// player draws again; seeking to where it already is makes it show the paused frame.
const redraw = (p: VideoPlayer) => {
  if (!p.playing && p.currentTime > 0) p.currentTime = p.currentTime;
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
    const meta = cb.current.meta;
    load(
      player,
      {
        uri: o.uri,
        contentType: "hls",
        headers: o.headers,
        metadata: meta && {
          title: meta.title,
          artist: meta.artist,
          artwork: meta.artwork,
        },
      },
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
        cb.current.onBuffering?.(e.status === "loading");
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);
  return useMemo(
    () => ({
      surface: player,
      seek: (sec: number, play?: boolean) => seekTo(player, sec, play),
      replay: () => seekTo(player, 0, true),
      toggle: () => (player.playing ? player.pause() : start(player)),
      pause: () => player.pause(),
      setRate: (r: number) => setRate(player, r),
      time: () => player.currentTime,
    }),
    [player],
  );
}

/** Shows the session's video. Only one surface is on screen at a time: the full page or the mini player. */
export function VideoSurface({
  surface,
  controls,
  fill,
  style,
}: {
  surface: SurfaceRef;
  controls?: boolean;
  /** Fill the view, cropping the edges, instead of showing the whole picture. */
  fill?: boolean;
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
  useEffect(() => {
    const t = setTimeout(() => redraw(surface), REDRAW_MS);
    return () => clearTimeout(t);
  }, [surface]);
  return (
    <VideoView
      ref={view}
      player={surface}
      style={style}
      nativeControls={full}
      contentFit={fill ? "cover" : "contain"}
      allowsPictureInPicture
      // The page draws its own controls; iOS's Live Text scan of a paused frame would sit over them.
      allowsVideoFrameAnalysis={false}
      onFirstFrameRender={() => redraw(surface)}
      startsPictureInPictureAutomatically
      fullscreenOptions={{ enable: true }}
      onFullscreenExit={() => setFull(false)}
    />
  );
}
