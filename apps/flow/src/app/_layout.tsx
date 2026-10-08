import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ActionSheetHost } from "../components/action-sheet";
import { startIslandController } from "../features/island/island";
import { NowPaletteSync } from "../features/now-playing/now-palette";
import { startEngine } from "../lib/engine";

export default function RootLayout() {
  useEffect(() => {
    void startEngine();
    return startIslandController();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
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
              options={{
                presentation: "modal",
                gestureEnabled: true,
                contentStyle: { backgroundColor: "#000" },
              }}
            />
            <Stack.Screen
              name="queue"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.6, 1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: "#121216" },
              }}
            />
            <Stack.Screen name="settings" options={{ presentation: "modal" }} />
            <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
          </Stack>
          <ActionSheetHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
