import { BlurView } from "expo-blur";
import { Fragment, type ReactNode, useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
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
import { readable, useAccent } from "../features/now-playing/now-palette";
import { display } from "../lib/type";
import { CheckGlyph } from "./glyphs";
import {
  GrabHandle,
  ScrollTopProvider,
  SheetScrollView,
  usePullToClose,
} from "./pull-to-close";

/** An icon, or a function drawing it in the colour the row wants (white, accent, red). */
export type SheetIcon = ReactNode | ((color: string) => ReactNode);
export type SheetAction = {
  label: string;
  onPress: () => void;
  /** Rows with an icon sit left-aligned; rows without stay centred (choices, confirmations). */
  icon?: SheetIcon;
  /** A second line; the row grows and the icon gets room for a cover. */
  sub?: string;
  destructive?: boolean;
  keepOpen?: boolean;
  /** A choice in a list: a tick on the right marks the current one. */
  checked?: boolean;
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
  /** A small heading for a list of choices, such as "Playback speed". */
  title?: string;
  header?: ReactNode;
  quick?: QuickAction[];
  actions: SheetAction[];
  /** The label of the button under the panel; Cancel unless the sheet is not a choice. */
  cancel?: string;
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
  /** Starting text, e.g. the current name when renaming. */
  initial?: string;
  /** Hands over an empty answer instead of the placeholder, e.g. to clear a description. */
  allowEmpty?: boolean;
  maxLength?: number;
}) {
  let text = o.initial ?? "";
  const submit = () =>
    o.onSubmit(text.trim() || (o.allowEmpty ? "" : o.placeholder));
  showSheet({
    header: (
      <View>
        <Text style={styles.noteTitle}>{o.title}</Text>
        <TextInput
          autoFocus
          defaultValue={o.initial}
          selectTextOnFocus={!!o.initial}
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
          maxLength={o.maxLength ?? 80}
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
  // The album's colour can be too dark to read on the dark sheet.
  const accent = readable(useAccent());
  // Rides above the keyboard when the sheet asks for text.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    transform: [
      { translateY: -Math.max(0, keyboard.height.value - insets.bottom) },
    ],
  }));
  const pull = usePullToClose(hideSheet);
  const { reset } = pull;
  // A sheet that was pulled away leaves the host offset; the next one starts in place.
  useEffect(reset, [sheet, reset]);
  if (!sheet) return null;
  // Wide windows (desktop) get a centred panel instead of one stretched edge to edge.
  const side = width > 700 ? (width - 440) / 2 : 10;
  const quick = sheet.quick ?? [];
  const top = !!sheet.header || !!sheet.title || quick.length > 0;
  // Leaves room for the header, tiles and Cancel; longer lists scroll.
  const rowsMax = Math.min(
    520,
    Math.max(200, height - insets.top - insets.bottom - 300),
  );
  return (
    <Overlay>
      {/* On iOS the overlay is its own window, outside the app's gesture root. */}
      <GestureHandlerRootView
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
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
          <GestureDetector gesture={pull.pan}>
            <Animated.View style={pull.style} onLayout={pull.onLayout}>
              <Animated.View
                entering={ENTER}
                exiting={EXIT}
                style={[styles.stack, { paddingBottom: insets.bottom + 8 }]}
              >
                <ScrollTopProvider value={pull.scrollY}>
                  <Glass style={styles.panel}>
                    <View style={styles.handle}>
                      <GrabHandle />
                    </View>
                    {top ? (
                      <View
                        style={[
                          styles.top,
                          sheet.actions.length > 0 && styles.topSep,
                        ]}
                      >
                        {sheet.title ? (
                          <Text style={styles.title}>{sheet.title}</Text>
                        ) : null}
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
                    <SheetScrollView style={{ maxHeight: rowsMax }}>
                      {sheet.actions.map((a, i) => {
                        const color = a.destructive ? RED : "#fff";
                        const press = () => {
                          if (!a.keepOpen) hideSheet();
                          a.onPress();
                        };
                        if (a.checked !== undefined)
                          return (
                            <Pressable
                              key={a.label}
                              accessibilityRole="button"
                              accessibilityState={{ selected: a.checked }}
                              onPress={press}
                              style={({ pressed }) => [
                                styles.choice,
                                i > 0 && styles.sep,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.iconLabel,
                                  { flex: 1 },
                                  a.checked && { color: accent },
                                ]}
                                numberOfLines={1}
                              >
                                {a.label}
                              </Text>
                              {a.checked ? (
                                <CheckGlyph
                                  size={20}
                                  color={accent}
                                  weight={2.6}
                                />
                              ) : null}
                            </Pressable>
                          );
                        if (a.icon)
                          return (
                            <Pressable
                              key={a.label}
                              accessibilityRole="button"
                              onPress={press}
                              style={({ pressed }) => [
                                styles.iconRow,
                                a.sub !== undefined && styles.tallRow,
                                pressed && styles.pressed,
                              ]}
                            >
                              <View
                                style={
                                  a.sub !== undefined
                                    ? styles.cover
                                    : styles.icon
                                }
                              >
                                {drawIcon(a.icon, color)}
                              </View>
                              {/* The separator starts after the icon, as in iOS lists. */}
                              <View
                                style={[styles.iconBody, i > 0 && styles.sep]}
                              >
                                <Text
                                  style={[styles.iconLabel, { color }]}
                                  numberOfLines={1}
                                >
                                  {a.label}
                                </Text>
                                {a.sub ? (
                                  <Text
                                    style={styles.iconSub}
                                    numberOfLines={1}
                                  >
                                    {a.sub}
                                  </Text>
                                ) : null}
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
                    </SheetScrollView>
                  </Glass>
                  <Pressable
                    onPress={hideSheet}
                    style={({ pressed }) => [
                      styles.cancel,
                      pressed && styles.cancelPressed,
                    ]}
                  >
                    <Text style={styles.cancelText}>
                      {sheet.cancel ?? "Cancel"}
                    </Text>
                  </Pressable>
                </ScrollTopProvider>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Overlay>
  );
}

const HAIR = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(0,0,0,0.55)" },
  wrap: { position: "absolute", left: 10, right: 10, bottom: 0 },
  stack: { gap: 8 },
  handle: { paddingBottom: 6 },
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
  title: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    textAlign: "center",
    paddingTop: 14,
    ...display("700"),
  },
  choice: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
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
  tallRow: { height: 62 },
  cover: {
    width: 42,
    height: 42,
    marginLeft: 12,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 2,
    paddingRight: 16,
  },
  iconBody: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
  iconLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    paddingRight: 16,
  },
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
