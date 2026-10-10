import { usePlayerSelect } from "@pawse/player";
import { LinearGradient } from "expo-linear-gradient";
import {
  TabList,
  TabSlot,
  Tabs,
  TabTrigger,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import { type ComponentType, forwardRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { MiniPlayer } from "../now-playing/mini-player";
import { useAccent } from "../now-playing/now-palette";
import { ExploreIcon, HomeIcon, LibraryIcon, SearchIcon } from "./icons";
import { OfflineBanner } from "./phone-tabs";

const NAV = [
  { name: "home", href: "/", label: "Home", Icon: HomeIcon },
  { name: "explore", href: "/explore", label: "Explore", Icon: ExploreIcon },
  { name: "library", href: "/library", label: "Library", Icon: LibraryIcon },
  { name: "search", href: "/search", label: "Search", Icon: SearchIcon },
] as const;

/** Android and narrow web: the mini player and the tabs share one dock that fades into the page. */
export function DockTabs() {
  const accent = useAccent();
  const hasTrack = usePlayerSelect((s) => !!s.current);
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs style={styles.root}>
      <TabSlot />
      <OfflineBanner />
      <View
        style={[styles.dock, { paddingBottom: Math.max(bottom, 8) }]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.88)", "#000"]}
          locations={[0, 0.38, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {hasTrack ? (
          <View style={styles.player}>
            {/* A faint wash of the song's colour gives the card depth instead of flat grey. */}
            <LinearGradient
              colors={[withAlpha(accent, 0.3), "rgba(23,22,29,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <MiniPlayer />
          </View>
        ) : null}
        <View style={styles.bar}>
          {NAV.map((n) => (
            <TabTrigger key={n.name} name={n.name} resetOnFocus asChild>
              <Item label={n.label} Icon={n.Icon} accent={accent} />
            </TabTrigger>
          ))}
        </View>
      </View>
      <TabList style={styles.hidden}>
        {NAV.map((n) => (
          <TabTrigger key={n.name} name={n.name} href={n.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

type ItemProps = TabTriggerSlotProps & {
  label: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
  accent: string;
};

const Item = forwardRef<View, ItemProps>(function Item(
  { label, Icon, accent, isFocused, onPress, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        haptic.tick();
        onPress?.(e);
      }}
      android_ripple={{
        color: "rgba(255,255,255,0.08)",
        borderless: true,
        radius: 36,
      }}
      style={styles.item}
    >
      <View
        style={[
          styles.pill,
          isFocused && { backgroundColor: withAlpha(accent, 0.2) },
        ]}
      >
        <Icon size={22} color={isFocused ? accent : "rgba(255,255,255,0.5)"} />
      </View>
      <Text style={[styles.label, isFocused && styles.labelOn]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  hidden: { display: "none" },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
  },
  player: {
    height: 62,
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#17161D",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bar: { flexDirection: "row", height: 58, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  pill: {
    width: 58,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11.5,
    fontWeight: "600",
  },
  labelOn: { color: "#fff", ...display("700") },
});

function withAlpha(color: string, a: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : color;
}
