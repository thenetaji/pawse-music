import { usePlayerSelect } from "@pawse/player";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnline } from "../../data/downloads";
import { display } from "../../lib/type";
import { MiniPlayer } from "../now-playing/mini-player";
import { useAccent } from "../now-playing/now-palette";
import { useVideoMini } from "../watch/store";
import { WatchMini } from "../watch/watch-mini";

/** iPhone: the native tab bar, with the mini player in its bottom accessory. */
export function PhoneTabs() {
  const accent = useAccent();
  const hasTrack = usePlayerSelect((s) => !!s.current);
  const videoMini = useVideoMini();
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <NativeTabs
        tintColor={accent}
        minimizeBehavior="onScrollDown"
        blurEffect="systemChromeMaterialDark"
      >
        {/* The mini player slot appears only once something is loaded. */}
        {Platform.OS === "ios" && (hasTrack || videoMini) ? (
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
          name="(watch)"
          hidden
          contentStyle={{ backgroundColor: "#000" }}
        >
          <NativeTabs.Trigger.Label>Watch</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="play.rectangle.fill"
            md="smart_display"
          />
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
    </View>
  );
}

// A quiet pill when the network drops; downloads keep playing.
export function OfflineBanner() {
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

// A video shrunk from full screen takes the slot until it's closed or music starts again.
function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const videoMini = useVideoMini();
  return videoMini ? (
    <WatchMini inline={placement === "inline"} />
  ) : (
    <MiniPlayer inline={placement === "inline"} />
  );
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
  offlineText: { color: "#fff", fontSize: 13, ...display("700") },
});
