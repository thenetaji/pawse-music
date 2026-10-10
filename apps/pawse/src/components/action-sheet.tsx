import { BlurView } from "expo-blur";
import { Fragment } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { create } from "zustand";
import { display } from "../lib/type";

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
};
type Sheet = { header?: React.ReactNode; actions: SheetAction[] };

const useSheet = create<{ sheet: Sheet | null }>(() => ({ sheet: null }));
export const showSheet = (sheet: Sheet) => useSheet.setState({ sheet });
export const hideSheet = () => useSheet.setState({ sheet: null });

// iOS presents modals in their own controller, above sibling views; a window overlay keeps the sheet on top.
const Overlay = Platform.OS === "ios" ? FullWindowOverlay : Fragment;

// A short rise and fade: quick to read, no bounce, cheap to draw.
const ENTER = FadeInDown.duration(200).easing(Easing.out(Easing.cubic));
const EXIT = FadeOutDown.duration(130);

/** A sheet header with a title and a short paragraph. */
export function SheetNote({ title, body }: { title: string; body: string }) {
  return (
    <View>
      <Text style={styles.noteTitle}>{title}</Text>
      <Text style={styles.noteBody}>{body}</Text>
    </View>
  );
}

// One app-wide action sheet: frosted glass panel over a dimmed screen.
export function ActionSheetHost() {
  const sheet = useSheet((s) => s.sheet);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  if (!sheet) return null;
  // Wide windows (desktop) get a centred panel instead of one stretched edge to edge.
  const side = width > 700 ? (width - 440) / 2 : 10;
  return (
    <Overlay>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(120)}
          style={[StyleSheet.absoluteFill, styles.dim]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={hideSheet} />
        </Animated.View>
        <Animated.View
          entering={ENTER}
          exiting={EXIT}
          style={[
            styles.wrap,
            { left: side, right: side, paddingBottom: insets.bottom + 8 },
            width > 700 && styles.wrapWide,
          ]}
        >
          <BlurView
            intensity={40}
            tint="systemThickMaterialDark"
            style={styles.panel}
          >
            {sheet.header ? (
              <View style={styles.header}>{sheet.header}</View>
            ) : null}
            <ScrollView style={{ maxHeight: 440 }} bounces={false}>
              {sheet.actions.map((a, i) => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    if (!a.keepOpen) hideSheet();
                    a.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.sep,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.label, a.destructive && styles.destructive]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </BlurView>
          <Pressable
            onPress={hideSheet}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(0,0,0,0.5)" },
  wrap: { position: "absolute", left: 10, right: 10, bottom: 0, gap: 8 },
  wrapWide: { bottom: 24 },
  noteTitle: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    ...display("800"),
  },
  noteBody: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
  },
  panel: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(40,40,46,0.6)",
  },
  header: {
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  row: { height: 54, alignItems: "center", justifyContent: "center" },
  sep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  label: { color: "#fff", fontSize: 17, fontWeight: "500" },
  destructive: { color: "#FF5A6A" },
  cancel: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(44,44,50,0.96)",
  },
  cancelText: { color: "#fff", fontSize: 17, ...display("700") },
});
