import type { Thumbnail } from "@pawse/music-core";
import ThumbsDownIcon from "lucide-react-native/icons/thumbs-down";
import ThumbsUpIcon from "lucide-react-native/icons/thumbs-up";
import { Fragment } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
  /** A button on the toast, such as Undo; it is the only touchable toast. */
  action?: { label: string; onPress: () => void };
  votes?: { up: () => void; down: () => void };
  key: number;
};
const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }));
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

/** A short line under the status bar, such as "Added to Road trip"; it leaves on its own, after `ms` if given. */
export function showToast(
  text: string,
  {
    ms,
    ...o
  }: Pick<Toast, "thumbnails" | "bad" | "action" | "votes"> & {
    ms?: number;
  } = {},
) {
  clearTimeout(timer);
  useToast.setState({ toast: { text, ...o, key: ++seq } });
  timer = setTimeout(
    () => useToast.setState({ toast: null }),
    ms ?? (o.bad ? 4000 : 2400),
  );
}

/** Takes the toast down at once, e.g. after its Undo was used. */
export function hideToast() {
  clearTimeout(timer);
  useToast.setState({ toast: null });
}

const Overlay = Platform.OS === "ios" ? FullWindowOverlay : Fragment;

export function ToastHost() {
  const toast = useToast((s) => s.toast);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <Overlay>
      <View
        pointerEvents="box-none"
        style={[styles.wrap, { top: insets.top + 8 }]}
      >
        <Animated.View
          key={toast.key}
          pointerEvents={toast.action || toast.votes ? "auto" : "none"}
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
          {toast.votes ? (
            <>
              {(["up", "down"] as const).map((k) => {
                const Icon = k === "up" ? ThumbsUpIcon : ThumbsDownIcon;
                return (
                  <Pressable
                    key={k}
                    hitSlop={10}
                    accessibilityLabel={k === "up" ? "Good skip" : "Wrong skip"}
                    onPress={() => {
                      hideToast();
                      toast.votes?.[k]();
                    }}
                  >
                    <Icon size={18} color="#fff" />
                  </Pressable>
                );
              })}
            </>
          ) : null}
          {toast.action ? (
            <Pressable
              hitSlop={10}
              onPress={() => {
                hideToast();
                toast.action?.onPress();
              }}
            >
              <Text style={styles.action}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
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
  action: { color: "#8B7CFF", fontSize: 14, ...display("800") },
});
