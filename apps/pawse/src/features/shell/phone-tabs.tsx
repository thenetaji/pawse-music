import { usePlayerSelect } from "@pawse/player";
import { LinearGradient } from "expo-linear-gradient";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnline } from "../../data/downloads";
import { MiniPlayer } from "../now-playing/mini-player";
import { useAccent } from "../now-playing/now-palette";
import { display } from "../../lib/type";

/** Phones (and narrow web windows): the native tab bar with the mini player. */
export function PhoneTabs() {
  const accent = useAccent();
  const hasTrack = usePlayerSelect((s) => !!s.current);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <NativeTabs
        tintColor={accent}
        minimizeBehavior="onScrollDown"
        blurEffect="systemChromeMaterialDark"
        {...(Platform.OS === "android" ? androidBar(accent) : {})}
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
            {/* A faint wash of the song's colour gives the card depth instead of flat grey. */}
            <LinearGradient
              colors={[withAlpha(accent, 0.28), "rgba(20,19,26,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
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

// Android: a near-black bar that melts into the app, labels always on, a soft accent pill.
function androidBar(accent: string) {
  return {
    backgroundColor: "#08080B",
    labelVisibilityMode: "labeled" as const,
    indicatorColor: withAlpha(accent, 0.2),
    rippleColor: "rgba(255,255,255,0.08)",
    iconColor: { default: "rgba(255,255,255,0.55)", selected: accent },
    labelStyle: {
      default: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
      selected: { color: accent, fontSize: 12 },
    },
  };
}

function withAlpha(color: string, a: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/\d+(\.\d+)?/g);
  return m && m.length >= 3 ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : color;
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
  offlineText: { color: "#fff", fontSize: 13, ...display("700") },
  floating: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: Platform.OS === "web" ? 70 : 92,
  },
  floatingCard: {
    height: 60,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(20,19,26,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    elevation: 14,
    shadowColor: "#000",
  },
});
