import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

const FRAME_MS = 2500;

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
};

/** Chromium has no HLS of its own, so hls.js feeds the playlist to a plain video element. */
export const VideoPlayer = forwardRef<VideoHandle, Props>(function VideoPlayer(
  { uri, poster, startAt, style, onEnd, onTime, onError, onFrame },
  ref,
) {
  const el = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onEnd, onTime, onError, onFrame });
  cb.current = { onEnd, onTime, onError, onFrame };
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    const hls = new Hls({ maxBufferLength: 30 });
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (d.fatal) cb.current.onError?.(d.details);
    });
    hls.loadSource(uri);
    hls.attachMedia(video);
    if (startAt) video.currentTime = startAt;
    void video.play().catch(() => {});
    return () => hls.destroy();
    // Starts once per source; a later startAt doesn't move a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  // A tiny frame grab is all the glow needs; it's blurred far past any detail.
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext("2d");
    const grab = () => {
      const video = el.current;
      if (!ctx || !video || video.paused || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        cb.current.onFrame?.(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        clearInterval(timer);
      }
    };
    const timer = setInterval(grab, FRAME_MS);
    return () => clearInterval(timer);
  }, []);
  useImperativeHandle(ref, () => ({
    seek: (sec) => {
      if (!el.current) return;
      el.current.currentTime = sec;
      void el.current.play().catch(() => {});
    },
    replay: () => {
      if (!el.current) return;
      el.current.currentTime = 0;
      void el.current.play().catch(() => {});
    },
  }));
  return (
    <View style={[styles.box, style]}>
      <video
        ref={el}
        controls
        poster={poster}
        playsInline
        style={{ width: "100%", height: "100%", background: "#000" }}
        onEnded={() => cb.current.onEnd?.()}
        onTimeUpdate={(e) => cb.current.onTime?.(e.currentTarget.currentTime)}
      />
    </View>
  );
});

const styles = StyleSheet.create({ box: { backgroundColor: "#000" } });
