import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { type ReactNode, useEffect } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  RefreshControl,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Cat, type CatColor, type CatMood } from "../features/cat/cat";
import { haptic } from "../lib/haptics";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";

// Pressable that springs down and gives a light tap. One element, so layout styles (flex, padding) apply directly.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function PressScale({
  children,
  style,
  onPress,
  scaleTo = 0.96,
  quiet,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  quiet?: boolean;
  children: ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={() =>
        s.set(withSpring(scaleTo, { damping: 16, stiffness: 420 }))
      }
      onPressOut={() => s.set(withSpring(1, { damping: 11, stiffness: 300 }))}
      onPress={(e: GestureResponderEvent) => {
        if (!quiet) haptic.tick();
        onPress?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ScreenProps = {
  title: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  background?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  bottomInset?: number;
};

// Large title that collapses into a blurred bar as you scroll; the tab bar hides itself on iOS 26.
export function Screen({
  title,
  back,
  right,
  children,
  background,
  onRefresh,
  refreshing,
  onEndReached,
  bottomInset = 150,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const bar = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [30, 70], [0, 1], "clamp"),
  }));
  const big = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 50], [1, 0], "clamp"),
    transform: [
      { scale: interpolate(y.value, [-120, 0], [1.12, 1], "clamp") },
      { translateY: interpolate(y.value, [-120, 0], [10, 0], "clamp") },
    ],
  }));
  return (
    <View style={styles.flex}>
      {background}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const n = e.nativeEvent;
          if (
            onEndReached &&
            n.contentOffset.y + n.layoutMeasurement.height >
              n.contentSize.height - 800
          )
            onEndReached();
        }}
        onScrollEndDrag={(e) => {
          const n = e.nativeEvent;
          if (
            onEndReached &&
            n.contentOffset.y + n.layoutMeasurement.height >
              n.contentSize.height - 800
          )
            onEndReached();
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor="#fff"
              refreshing={!!refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + bottomInset,
        }}
      >
        {back ? (
          <Pressable
            hitSlop={12}
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleRow}>
          <Animated.Text style={[styles.h1, big]} numberOfLines={1}>
            {title}
          </Animated.Text>
          {right}
        </View>
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[styles.bar, { height: insets.top + 44 }, bar]}
      >
        <BlurView
          intensity={50}
          tint="systemChromeMaterialDark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.hairline} />
        <Text style={[styles.barTitle, { marginTop: insets.top + 12 }]}>
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

export function SectionTitle({
  title,
  kicker,
  onMore,
}: {
  title: string;
  kicker?: string;
  onMore?: () => void;
}) {
  return (
    <Pressable disabled={!onMore} onPress={onMore} style={styles.section}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.sectionTitle} numberOfLines={1}>
        {title}
        {onMore ? <Text style={styles.chev}> ›</Text> : null}
      </Text>
    </Pressable>
  );
}

// Shimmering placeholder block.
export function Skeleton({
  w,
  h,
  r = 8,
  style,
}: {
  w: number | `${number}%`;
  h: number;
  r?: number;
  style?: ViewStyle;
}) {
  const t = useSharedValue(0.4);
  useEffect(() => {
    t.set(
      withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [t]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.35 }));
  return (
    <Animated.View
      style={[
        {
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: "rgba(255,255,255,0.1)",
        },
        a,
        style,
      ]}
    />
  );
}

export function SkeletonShelves({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ marginTop: 28 }}>
          <Skeleton
            w={160}
            h={20}
            style={{ marginLeft: 20, marginBottom: 12 }}
          />
          <View
            style={{ flexDirection: "row", gap: 14, paddingHorizontal: 20 }}
          >
            {[0, 1, 2].map((j) => (
              <View key={j}>
                <Skeleton w={152} h={152} r={10} />
                <Skeleton w={110} h={12} style={{ marginTop: 10 }} />
                <Skeleton w={80} h={10} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <View style={{ paddingTop: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 13,
            paddingHorizontal: 20,
            paddingVertical: 7,
          }}
        >
          <Skeleton w={50} h={50} r={7} />
          <View style={{ flex: 1 }}>
            <Skeleton w="70%" h={13} />
            <Skeleton w="45%" h={11} style={{ marginTop: 7 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const STATES: Record<string, { mood: CatMood; title: string }> = {
  empty: { mood: "idle", title: "Nothing here yet" },
  offline: { mood: "sleep", title: "You're offline" },
  error: { mood: "curious", title: "Something went sideways" },
  loading: { mood: "groove", title: "" },
};

// The cat fills every empty, offline and error state.
export function CatState({
  kind,
  message,
  action,
  onAction,
}: {
  kind: keyof typeof STATES;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const color = useSetting<CatColor>("catColor", "orange");
  const s = STATES[kind];
  return (
    <View style={styles.state}>
      <Cat mood={s.mood} size={96} color={color} />
      {s.title ? <Text style={styles.stateTitle}>{s.title}</Text> : null}
      {message ? <Text style={styles.stateMsg}>{message}</Text> : null}
      {action && onAction ? (
        <PressScale onPress={onAction} style={styles.stateBtn}>
          <Text style={styles.stateBtnText}>{action}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  on,
  accent,
  onPress,
}: {
  label: string;
  on?: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={[
        styles.chip,
        on ? { backgroundColor: accent, borderColor: accent } : {},
      ]}
    >
      <Text style={[styles.chipText, on ? { color: "#000" } : {}]}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000" },
  back: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  backText: { color: "#fff", fontSize: 28, fontWeight: "400", marginTop: -3 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  h1: {
    color: "#fff",
    fontSize: 34,
    ...display("800"),
    letterSpacing: -0.8,
    flexShrink: 1,
    transformOrigin: "left",
  },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    overflow: "hidden",
  },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  barTitle: { color: "#fff", fontSize: 17, ...display("700") },
  section: { paddingHorizontal: 20, marginTop: 28, marginBottom: 10 },
  kicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    ...display("700"),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    ...display("800"),
    letterSpacing: -0.4,
  },
  chev: { color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  state: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    paddingHorizontal: 30,
  },
  stateTitle: { color: "#fff", fontSize: 19, ...display("700"), marginTop: 14 },
  stateMsg: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 21,
  },
  stateBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  stateBtnText: { color: "#fff", fontSize: 15, ...display("700") },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  chipText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
