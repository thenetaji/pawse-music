import type { Thumbnail } from "@pawse/music-core";
import { Fragment } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { create } from "zustand";

import { display } from "../lib/type";
import { Artwork } from "./artwork";

type Toast = {
  text: string;
  thumbnails?: Thumbnail[];
  bad?: boolean;
  key: number;
};
const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }));
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

/** A short line under the status bar, such as "Added to Road trip"; it leaves on its own. */
export function showToast(
  text: string,
  o?: { thumbnails?: Thumbnail[]; bad?: boolean },
) {
  clearTimeout(timer);
  useToast.setState({ toast: { text, ...o, key: ++seq } });
  timer = setTimeout(
    () => useToast.setState({ toast: null }),
    o?.bad ? 4000 : 2400,
  );
}

const Overlay = Platform.OS === "ios" ? FullWindowOverlay : Fragment;

export function ToastHost() {
  const toast = useToast((s) => s.toast);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <Overlay>
      <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
        <Animated.View
          key={toast.key}
          entering={FadeInUp.duration(180)}
          exiting={FadeOutUp.duration(140)}
          style={[styles.pill, toast.bad && styles.bad]}
        >
          {toast.thumbnails?.length ? (
            <Artwork thumbnails={toast.thumbnails} size={28} radius={6} />
          ) : null}
          <Text style={styles.text} numberOfLines={2}>
            {toast.text}
          </Text>
        </Animated.View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 440,
    minHeight: 44,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 22,
    backgroundColor: "#2A2A31",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  bad: { backgroundColor: "#3A2229" },
  text: { flexShrink: 1, color: "#fff", fontSize: 14, ...display("700") },
});
