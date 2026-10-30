import "../global.css";

import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ReducedMotionConfig, ReduceMotion } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ActionSheetHost } from "../components/action-sheet";
import { ToastHost } from "../components/toast";
import { startAutoBackup } from "../data/auto-backup";
import { startJournalRecorder } from "../data/journal-recorder";
import { startScrobbler } from "../data/scrobbler";
import { startDiscordStatus } from "../lib/discord-status";
import { useLibrary } from "../data/library";
import { startAlarm } from "../features/alarm/alarm";
import { startMochi } from "../features/cat/mochi";
import { startAndroidPill } from "../features/island/android-pill";
import { startIslandController } from "../features/island/island";
import { MindfulCard } from "../features/mindful/mindful-card";
import { startMindfulTracker } from "../features/mindful/tracker";
import { NowPaletteSync } from "../features/now-playing/now-palette";
import { startListSpotRecorder } from "../features/playback/list-spot-recorder";
import { startNowPlayingGuard } from "../features/playback/now-playing-guard";
import { startResumeController } from "../features/playback/resume-after-interruption";
import { WatchHost } from "../features/watch/watch-host";
import { startSharingRatings } from "../lib/contribute";
import { startEngine } from "../lib/engine";
import { startFreshFeeds } from "../lib/fresh-feeds";
import { lockPortrait } from "../lib/orientation";
import { getSetting, useSetting } from "../lib/settings";
import { checkOnLaunch } from "../lib/updates";
import { startYouTubeHistory } from "../lib/youtube-history";
import { YouTubeSandboxHost } from "../lib/youtube-sandbox";

export { ErrorScreen as ErrorBoundary } from "../components/error-screen";

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
    const stopResume = startResumeController();
    // Android has no start-up lock; keep every screen upright until a video goes full screen.
    lockPortrait();
    const stopGuard = startNowPlayingGuard();
    const stopSpots = startListSpotRecorder();
    const stopFresh = startFreshFeeds();
    const stopHistory = startYouTubeHistory();
    const stopBackup = startAutoBackup();
    const stopJournal = startJournalRecorder();
    const stopScrobbler = startScrobbler();
    const stopDiscord = startDiscordStatus();
    const stopRatings = startSharingRatings();
    const stopMindful = startMindfulTracker();
    const stopMochi = startMochi();
    const stopAlarm = startAlarm();
    // First launch: meet the cat once the persisted library has loaded.
    const onboard = () => {
      if (!getSetting("onboarded", false))
        setTimeout(() => router.push("/onboarding"), 50);
      else void checkOnLaunch();
    };
    if (useLibrary.persist.hasHydrated()) onboard();
    const unsub = useLibrary.persist.onFinishHydration(onboard);
    return () => {
      stopIsland();
      stopPill?.();
      stopResume();
      stopGuard();
      stopSpots();
      stopFresh();
      stopHistory();
      stopBackup();
      stopJournal();
      stopScrobbler();
      stopDiscord();
      stopRatings();
      stopMindful();
      stopMochi();
      stopAlarm();
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
            {/* Links only: it hands the video to the watch overlay and steps aside. */}
            <Stack.Screen
              name="video/[id]"
              options={{ presentation: "transparentModal", animation: "none" }}
            />
            <Stack.Screen name="settings" options={modal} />
            <Stack.Screen name="about" options={modal} />
            <Stack.Screen name="equaliser" options={modal} />
            <Stack.Screen name="blocked" options={modal} />
            <Stack.Screen name="experimental" options={modal} />
            <Stack.Screen name="edit-home" options={modal} />
            <Stack.Screen name="focus" options={modal} />
            <Stack.Screen name="mochi" options={modal} />
            <Stack.Screen name="alarm" options={modal} />
            {/* Android's alarm notification links here; it starts the music and steps aside. */}
            <Stack.Screen
              name="wake"
              options={{ presentation: "transparentModal", animation: "none" }}
            />
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
          <WatchHost />
          <MindfulCard />
          <ActionSheetHost />
          <ToastHost />
          <YouTubeSandboxHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
