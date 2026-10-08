import "../global.css";

import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ReducedMotionConfig, ReduceMotion } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ActionSheetHost } from "../components/action-sheet";
import { useLibrary } from "../data/library";
import { startAndroidPill } from "../features/island/android-pill";
import { startIslandController } from "../features/island/island";
import { NowPaletteSync } from "../features/now-playing/now-palette";
import { startEngine } from "../lib/engine";
import { getSetting, useSetting } from "../lib/settings";

const modal = {
  presentation: "modal" as const,
  contentStyle: { backgroundColor: "#000" },
};

export default function RootLayout() {
  const reduce = useSetting("reduceMotion", false);
  useEffect(() => {
    void startEngine();
    const stopIsland = startIslandController();
    const stopPill = startAndroidPill();
    // First launch: meet the cat once the persisted library has loaded.
    const onboard = () => {
      if (!getSetting("onboarded", false))
        setTimeout(() => router.push("/onboarding"), 50);
    };
    if (useLibrary.persist.hasHydrated()) onboard();
    const unsub = useLibrary.persist.onFinishHydration(onboard);
    return () => {
      stopIsland();
      stopPill?.();
      unsub();
    };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ReducedMotionConfig
          mode={reduce ? ReduceMotion.Always : ReduceMotion.System}
        />
        <NowPaletteSync />
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#000" },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="now-playing"
              options={{ ...modal, gestureEnabled: true }}
            />
            <Stack.Screen name="queue" options={modal} />
            <Stack.Screen name="settings" options={modal} />
            <Stack.Screen name="about" options={modal} />
            <Stack.Screen name="sign-in" options={modal} />
            <Stack.Screen name="import" options={modal} />
            <Stack.Screen name="downloads" options={modal} />
            <Stack.Screen name="share-card" options={modal} />
            <Stack.Screen
              name="onboarding"
              options={{
                presentation: "fullScreenModal",
                gestureEnabled: false,
                contentStyle: { backgroundColor: "#000" },
              }}
            />
          </Stack>
          <ActionSheetHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
