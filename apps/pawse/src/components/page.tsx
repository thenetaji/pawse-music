import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setActiveTab } from "../lib/nav";

export function useTabRoot(tab: "home" | "explore" | "search" | "library") {
  useFocusEffect(useCallback(() => setActiveTab(tab), [tab]));
}

export function useBottomSpace() {
  // Room for the floating tab bar and mini player.
  return useSafeAreaInsets().bottom + 150;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color="rgba(255,255,255,0.7)" />
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.err}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  center: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  err: { color: "rgba(255,255,255,0.6)", fontSize: 16, textAlign: "center" },
  retry: {
    marginTop: 14,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
