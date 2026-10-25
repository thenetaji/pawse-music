import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

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

/** Chromium has no HLS of its own, so hls.js feeds the playlist to a plain video element. */
export const VideoPlayer = forwardRef<VideoHandle, Props>(function VideoPlayer(
  { uri, poster, startAt, style, onEnd, onTime, onError },
  ref,
) {
  const el = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onEnd, onTime, onError });
  cb.current = { onEnd, onTime, onError };
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
