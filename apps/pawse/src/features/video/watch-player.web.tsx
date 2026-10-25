import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

import type { WatchPlayer, WatchPlayerOptions } from "./watch-player";

export type { WatchPlayer, WatchPlayerOptions } from "./watch-player";

/** The session's one <video> element; a surface moves it into its own box. */
export type SurfaceRef = HTMLVideoElement;

const FRAME_MS = 2500;

// Outside the components: the compiler treats state and props as read-only.
const setTime = (v: HTMLVideoElement, sec: number) => {
  v.currentTime = sec;
};
const play = (v: HTMLVideoElement) => void v.play().catch(() => {});
const setControls = (v: HTMLVideoElement, on: boolean) => {
  v.controls = on;
};
const setRate = (v: HTMLVideoElement, r: number) => {
  v.playbackRate = r;
};

let enterFull: (() => void) | undefined;
/** Full screen with the browser's own controls, which go away again on the way out. */
export const enterFullscreen = () => enterFull?.();

/** Chromium has no HLS of its own, so hls.js feeds the playlist to a <video> element that lives for the session. */
export function useWatchPlayer(
  o: WatchPlayerOptions,
): Omit<WatchPlayer, "surface"> & { surface: SurfaceRef } {
  const cb = useRef(o);
  // The latest callbacks, for events; declared first so the load below sees this render's startAt.
  useEffect(() => {
    cb.current = o;
  });
  const [video] = useState(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.style.cssText = "width:100%;height:100%;background:#000;display:block";
    return v;
  });
  useEffect(() => {
    if (!o.uri) return;
    const hls = new Hls({ maxBufferLength: 30 });
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (d.fatal) cb.current.onError?.(d.details);
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
      const level = hls.levels[d.level];
      if (level?.height)
        cb.current.onTrack?.(level.height, level.frameRate || undefined);
    });
    hls.loadSource(o.uri);
    hls.attachMedia(video);
    const start = cb.current.startAt;
    if (start) setTime(video, start);
    play(video);
    return () => hls.destroy();
  }, [video, o.uri]);
  useEffect(() => {
    const time = () => cb.current.onTime?.(video.currentTime);
    const end = () => cb.current.onEnd?.();
    const on = () => cb.current.onPlaying?.(true);
    const off = () => cb.current.onPlaying?.(false);
    video.addEventListener("timeupdate", time);
    video.addEventListener("ended", end);
    video.addEventListener("play", on);
    video.addEventListener("pause", off);
    // A tiny frame grab is all the glow needs; it's blurred far past any detail.
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext("2d");
    const timer = setInterval(() => {
      if (!ctx || video.paused || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        cb.current.onFrame?.(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        clearInterval(timer);
      }
    }, FRAME_MS);
    return () => {
      clearInterval(timer);
      video.removeEventListener("timeupdate", time);
      video.removeEventListener("ended", end);
      video.removeEventListener("play", on);
      video.removeEventListener("pause", off);
      video.pause();
    };
  }, [video]);
  return useMemo(
    () => ({
      surface: video,
      seek: (sec: number) => {
        setTime(video, sec);
        play(video);
      },
      replay: () => {
        setTime(video, 0);
        play(video);
      },
      toggle: () => (video.paused ? play(video) : video.pause()),
      pause: () => video.pause(),
      setRate: (r: number) => setRate(video, r),
      time: () => video.currentTime,
    }),
    [video],
  );
}

/** Moves the session's <video> into this box; moving it between boxes in one render keeps it playing. */
export function VideoSurface({
  surface,
  controls,
  style,
}: {
  surface: SurfaceRef;
  controls?: boolean;
  /** Pinch zoom is phone only; the browser has its own full screen. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const box = useRef<View>(null);
  useEffect(() => {
    const node = box.current as unknown as HTMLElement | null;
    if (!node) return;
    node.appendChild(surface);
    // The page draws its own controls.
    setControls(surface, false);
    if (!controls) return;
    const exit = () => {
      if (!document.fullscreenElement) setControls(surface, false);
    };
    document.addEventListener("fullscreenchange", exit);
    enterFull = () => {
      setControls(surface, true);
      void surface
        .requestFullscreen?.()
        .catch(() => setControls(surface, false));
    };
    return () => {
      document.removeEventListener("fullscreenchange", exit);
      enterFull = undefined;
    };
  }, [surface, controls]);
  return <View ref={box} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({ box: { backgroundColor: "#000" } });
