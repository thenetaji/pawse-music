import type { ErrorBoundaryProps } from "expo-router";
import { View } from "react-native";

import { CatState } from "./ui";

// A crashing screen shows the cat and a retry instead of closing the app.
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}
    >
      <CatState
        kind="error"
        message={error.message || "This screen hit a snag."}
        action="Try again"
        onAction={() => void retry()}
      />
    </View>
  );
}
