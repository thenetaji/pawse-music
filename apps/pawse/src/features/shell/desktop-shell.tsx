import { getProgress, player, usePlayerState } from "@pawse/player";
import { router } from "expo-router";
import {
  TabList,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
  Tabs,
} from "expo-router/ui";
import { type ComponentType, forwardRef, useEffect, useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ContentWidth } from "../../lib/layout";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";
import {
  ExploreIcon,
  GearIcon,
  HomeIcon,
  LibraryIcon,
  SearchIcon,
} from "./icons";
import { PlayerBar } from "./player-bar";

// React Native Web adds hover to the pressable state.
type Hover = PressableStateCallbackType & { hovered?: boolean };

/** Windows at least this wide get the sidebar and player bar instead of tabs. */
export const DESKTOP_MIN_WIDTH = 900;

const NAV = [
  { name: "home", href: "/", label: "Home", Icon: HomeIcon },
  { name: "explore", href: "/explore", label: "Explore", Icon: ExploreIcon },
  { name: "search", href: "/search", label: "Search", Icon: SearchIcon },
  { name: "library", href: "/library", label: "Library", Icon: LibraryIcon },
] as const;

export function DesktopShell() {
  useDesktopKeys();
  const [width, setWidth] = useState<number | null>(null);
  return (
    <Tabs style={styles.root}>
      <View style={styles.main}>
        <Sidebar />
        <View
          style={styles.content}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          <ContentWidth value={width}>
            <TabSlot />
          </ContentWidth>
        </View>
      </View>
      <PlayerBar />
      <TabList style={styles.hidden}>
        {NAV.map((n) => (
          <TabTrigger key={n.name} name={n.name} href={n.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

function Sidebar() {
  const accent = useAccent();
  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.wordmark}>Pawse</Text>
      </View>
      <View style={styles.nav}>
        {NAV.map((n) => (
          <TabTrigger key={n.name} name={n.name} asChild>
            <NavItem label={n.label} Icon={n.Icon} accent={accent} />
          </TabTrigger>
        ))}
      </View>
      <View style={styles.spacer} />
      <SidebarCat />
      <Pressable
        onPress={() => router.push("/settings")}
        style={({ hovered }: Hover) => [
          styles.item,
          hovered && styles.itemHover,
        ]}
      >
        <GearIcon color="rgba(255,255,255,0.6)" />
        <Text style={styles.itemLabel}>Settings</Text>
      </Pressable>
    </View>
  );
}

type NavItemProps = TabTriggerSlotProps & {
  label: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
  accent: string;
};

const NavItem = forwardRef<View, NavItemProps>(function NavItem(
  { label, Icon, accent, isFocused, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={({ hovered }: Hover) => [
        styles.item,
        hovered && styles.itemHover,
        isFocused && styles.itemOn,
      ]}
    >
      <Icon size={20} color={isFocused ? accent : "rgba(255,255,255,0.6)"} />
      <Text style={[styles.itemLabel, isFocused && styles.itemLabelOn]}>
        {label}
      </Text>
    </Pressable>
  );
});

// The cat keeps you company in the corner: it dances while music plays and naps otherwise.
function SidebarCat() {
  const { status } = usePlayerState();
  const playing = status === "playing";
  const color = useSetting<CatColor>("catColor", "orange");
  return (
    <View style={styles.cat} pointerEvents="none">
      <Cat mood={playing ? "groove" : "sleep"} size={72} color={color} />
    </View>
  );
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

// Space plays and pauses, arrows seek and skip, Cmd/Ctrl+F searches, Cmd/Ctrl+, opens settings.
function useDesktopKeys() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        router.navigate("/search");
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
        return;
      }
      if (typing(e.target) || mod || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowRight" && e.shiftKey) player.next();
      else if (e.key === "ArrowLeft" && e.shiftKey) player.previous();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const step = e.key === "ArrowRight" ? 10 : -10;
        player.seekTo(Math.max(0, getProgress().position + step));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  main: { flex: 1, flexDirection: "row", minHeight: 0 },
  content: { flex: 1, minWidth: 0, backgroundColor: "#000" },
  hidden: { display: "none" },
  sidebar: {
    width: 232,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#08080B",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  brand: { height: 64, justifyContent: "flex-end", paddingHorizontal: 12 },
  wordmark: { color: "#fff", fontSize: 24, ...display("800") },
  nav: { marginTop: 18, gap: 2 },
  item: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  itemOn: { backgroundColor: "rgba(255,255,255,0.09)" },
  itemLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14.5,
    ...display("700"),
  },
  itemLabelOn: { color: "#fff" },
  spacer: { flex: 1 },
  cat: { alignItems: "center", marginBottom: 8 },
});
