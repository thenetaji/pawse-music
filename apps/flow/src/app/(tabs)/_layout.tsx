import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet, View } from "react-native";

import { MiniPlayer } from "../../features/now-playing/mini-player";
import { useAccent } from "../../features/now-playing/now-palette";

export default function TabsLayout() {
  const accent = useAccent();
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <NativeTabs
        tintColor={accent}
        minimizeBehavior="onScrollDown"
        blurEffect="systemChromeMaterialDark"
      >
        {Platform.OS === "ios" ? (
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
      {Platform.OS !== "ios" ? (
        <View style={styles.floating} pointerEvents="box-none">
          <View style={styles.floatingCard}>
            <MiniPlayer />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayer inline={placement === "inline"} />;
}

const styles = StyleSheet.create({
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
