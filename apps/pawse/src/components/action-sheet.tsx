import { BlurView } from "expo-blur";
import { Fragment, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { create } from "zustand";
import { useAccent } from "../features/now-playing/now-palette";
import { display } from "../lib/type";

/** An icon, or a function drawing it in the colour the row wants (white, accent, red). */
export type SheetIcon = ReactNode | ((color: string) => ReactNode);
export type SheetAction = {
  label: string;
  onPress: () => void;
  /** Rows with an icon sit left-aligned; rows without stay centred (choices, confirmations). */
  icon?: SheetIcon;
  destructive?: boolean;
  keepOpen?: boolean;
};
/** A tile in the row under the header (Like, Download, Share...). */
export type QuickAction = {
  label: string;
  icon: SheetIcon;
  active?: boolean;
  onPress: () => void;
  keepOpen?: boolean;
};
type Sheet = {
  header?: ReactNode;
  quick?: QuickAction[];
  actions: SheetAction[];
};

const useSheet = create<{ sheet: Sheet | null }>(() => ({ sheet: null }));
export const showSheet = (sheet: Sheet) => useSheet.setState({ sheet });
export const hideSheet = () => useSheet.setState({ sheet: null });

// iOS presents modals in their own controller, above sibling views; a window overlay keeps the sheet on top.
const Overlay = Platform.OS === "ios" ? FullWindowOverlay : Fragment;

// A short rise and fade: quick to read, no bounce, cheap to draw.
const ENTER = FadeInDown.duration(200).easing(Easing.out(Easing.cubic));
const EXIT = FadeOutDown.duration(130);

/** Asks for a short line of text, such as a playlist name; an empty answer uses the placeholder. */
export function askText(o: {
  title: string;
  placeholder: string;
  confirm: string;
  onSubmit: (text: string) => void;
}) {
  let text = "";
  const submit = () => o.onSubmit(text.trim() || o.placeholder);
  showSheet({
    header: (
      <View>
        <Text style={styles.noteTitle}>{o.title}</Text>
        <TextInput
          autoFocus
          placeholder={o.placeholder}
          placeholderTextColor="rgba(255,255,255,0.35)"
          onChangeText={(t) => {
            text = t;
          }}
          onSubmitEditing={() => {
            hideSheet();
            submit();
          }}
          returnKeyType="done"
          maxLength={80}
          selectionColor="#fff"
          style={styles.input}
        />
      </View>
    ),
    actions: [{ label: o.confirm, onPress: submit }],
  });
}

/** A sheet header with a title and a short paragraph. */
export function SheetNote({ title, body }: { title: string; body: string }) {
  return (
    <View>
      <Text style={styles.noteTitle}>{title}</Text>
      <Text style={styles.noteBody}>{body}</Text>
    </View>
  );
}

const RED = "#FF5A6A";
const drawIcon = (icon: SheetIcon, color: string) =>
  typeof icon === "function" ? icon(color) : icon;

// Frosted glass on iOS and web; Android's blur is costly and uneven, so a solid dark surface.
function Glass({ style, children }: { style: object; children: ReactNode }) {
  if (Platform.OS === "android")
    return <View style={[style, styles.solid]}>{children}</View>;
  return (
    <BlurView intensity={40} tint="systemThickMaterialDark" style={style}>
      {children}
    </BlurView>
  );
}

// One app-wide action sheet: a dark glass panel over a dimmed screen.
export function ActionSheetHost() {
  const sheet = useSheet((s) => s.sheet);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const accent = useAccent();
  // Rides above the keyboard when the sheet asks for text.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    transform: [
      { translateY: -Math.max(0, keyboard.height.value - insets.bottom) },
    ],
  }));
  if (!sheet) return null;
  // Wide windows (desktop) get a centred panel instead of one stretched edge to edge.
  const side = width > 700 ? (width - 440) / 2 : 10;
  const quick = sheet.quick ?? [];
  const top = !!sheet.header || quick.length > 0;
  // Leaves room for the header, tiles and Cancel; longer lists scroll.
  const rowsMax = Math.min(
    520,
    Math.max(200, height - insets.top - insets.bottom - 300),
  );
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
          style={[
            styles.wrap,
            { left: side, right: side },
            width > 700 && styles.wrapWide,
            lift,
          ]}
        >
          <Animated.View
            entering={ENTER}
            exiting={EXIT}
            style={[styles.stack, { paddingBottom: insets.bottom + 8 }]}
          >
            <Glass style={styles.panel}>
              {top ? (
                <View
                  style={[
                    styles.top,
                    sheet.actions.length > 0 && styles.topSep,
                  ]}
                >
                  {sheet.header ? (
                    <View style={styles.header}>{sheet.header}</View>
                  ) : null}
                  {quick.length ? (
                    <View
                      style={[
                        styles.quick,
                        !sheet.header && { paddingTop: 12 },
                      ]}
                    >
                      {quick.map((q) => {
                        const tint = q.active ? accent : "#fff";
                        return (
                          <Pressable
                            key={q.label}
                            accessibilityRole="button"
                            accessibilityLabel={q.label}
                            accessibilityState={{ selected: !!q.active }}
                            onPress={() => {
                              if (!q.keepOpen) hideSheet();
                              q.onPress();
                            }}
                            style={({ pressed }) => [
                              styles.tile,
                              pressed && styles.tilePressed,
                            ]}
                          >
                            {q.active ? (
                              <View
                                style={[
                                  StyleSheet.absoluteFill,
                                  styles.tileWash,
                                  { backgroundColor: accent },
                                ]}
                              />
                            ) : null}
                            {drawIcon(q.icon, tint)}
                            <Text
                              style={[styles.tileLabel, { color: tint }]}
                              numberOfLines={1}
                            >
                              {q.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <ScrollView style={{ maxHeight: rowsMax }} bounces={false}>
                {sheet.actions.map((a, i) => {
                  const color = a.destructive ? RED : "#fff";
                  const press = () => {
                    if (!a.keepOpen) hideSheet();
                    a.onPress();
                  };
                  if (a.icon)
                    return (
                      <Pressable
                        key={a.label}
                        accessibilityRole="button"
                        onPress={press}
                        style={({ pressed }) => [
                          styles.iconRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.icon}>
                          {drawIcon(a.icon, color)}
                        </View>
                        {/* The separator starts after the icon, as in iOS lists. */}
                        <View style={[styles.iconBody, i > 0 && styles.sep]}>
                          <Text
                            style={[styles.iconLabel, { color }]}
                            numberOfLines={1}
                          >
                            {a.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  return (
                    <Pressable
                      key={a.label}
                      accessibilityRole="button"
                      onPress={press}
                      style={({ pressed }) => [
                        styles.row,
                        i > 0 && styles.sep,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.label,
                          a.destructive && styles.destructive,
                        ]}
                      >
                        {a.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Glass>
            <Pressable
              onPress={hideSheet}
              style={({ pressed }) => [
                styles.cancel,
                pressed && styles.cancelPressed,
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Overlay>
  );
}

const HAIR = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(0,0,0,0.55)" },
  wrap: { position: "absolute", left: 10, right: 10, bottom: 0 },
  stack: { gap: 8 },
  wrapWide: { bottom: 24 },
  noteTitle: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    ...display("800"),
  },
  input: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#fff",
    fontSize: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
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
    borderWidth: HAIR,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(28,27,34,0.62)",
  },
  solid: { backgroundColor: "#17161D" },
  top: { paddingBottom: 12 },
  topSep: {
    borderBottomWidth: HAIR,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  quick: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  tile: {
    flex: 1,
    height: 66,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  tilePressed: { backgroundColor: "rgba(255,255,255,0.14)" },
  tileWash: { opacity: 0.16 },
  tileLabel: { fontSize: 12, fontWeight: "600" },
  row: { height: 54, alignItems: "center", justifyContent: "center" },
  iconRow: { height: 52, flexDirection: "row", alignItems: "center" },
  icon: { width: 22, height: 22, marginLeft: 18, marginRight: 16 },
  iconBody: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
  iconLabel: { fontSize: 16, fontWeight: "600", paddingRight: 16 },
  sep: {
    borderTopWidth: HAIR,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.07)" },
  label: { color: "#fff", fontSize: 17, fontWeight: "500" },
  destructive: { color: RED },
  cancel: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: HAIR,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor:
      Platform.OS === "android" ? "#17161D" : "rgba(30,29,36,0.96)",
  },
  cancelPressed: { backgroundColor: "#24232B" },
  cancelText: { color: "#fff", fontSize: 17, ...display("700") },
});
