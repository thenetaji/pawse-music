import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet, View } from "react-native";

import { usePlayerSelect } from "@studio/player";

import { useOnline } from "../../data/downloads";
import { MiniPlayer } from "../../features/now-playing/mini-player";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccent } from "../../features/now-playing/now-palette";

export default function TabsLayout() {
  const accent = useAccent();
  const hasTrack = usePlayerSelect((s) => !!s.current);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <NativeTabs
        tintColor={accent}
        minimizeBehavior="onScrollDown"
        blurEffect="systemChromeMaterialDark"
      >
        {/* The mini player slot appears only once something is loaded. */}
        {Platform.OS === "ios" && hasTrack ? (
          <NativeTabs.BottomAccessory>
            <Accessory />
          </NativeTabs.BottomAccessory>
        ) : null}
        <NativeTabs.Trigger
          name="(home)"
          contentStyle={{ backgroundColor: "#000" }}
        >
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(explore)"
          contentStyle={{ backgroundColor: "#000" }}
        >
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" md="explore" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(library)"
          contentStyle={{ backgroundColor: "#000" }}
        >
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.stack.fill" md="library_music" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(search)"
          role="search"
          contentStyle={{ backgroundColor: "#000" }}
        >
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>
      </NativeTabs>
      <OfflineBanner />
      {Platform.OS !== "ios" && hasTrack ? (
        <View style={styles.floating} pointerEvents="box-none">
          <View style={styles.floatingCard}>
            <MiniPlayer />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// A quiet pill when the network drops; downloads keep playing.
function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      pointerEvents="none"
      style={[styles.offline, { top: insets.top + 4 }]}
    >
      <Animated.Text style={styles.offlineText}>
        Offline · playing downloads
      </Animated.Text>
    </Animated.View>
  );
}

function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayer inline={placement === "inline"} />;
}

const styles = StyleSheet.create({
  offline: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    backgroundColor: "rgba(40,40,46,0.95)",
  },
  offlineText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  floating: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: Platform.OS === "web" ? 70 : 92,
  },
  floatingCard: {
    height: 58,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(38,38,44,0.94)",
  },
});
