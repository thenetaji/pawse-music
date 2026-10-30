import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useSetting } from "../../lib/settings";

/** On screen and the app in front: the only time a cat needs to move. */
export function useCatVisible(): boolean {
  const focused = useIsFocused();
  const [front, setFront] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setFront(s === "active"),
    );
    return () => sub.remove();
  }, []);
  return focused && front;
}

/** Reduce motion in Settings or on the phone. */
export function useCatCalm(): boolean {
  const setting = useSetting("reduceMotion", false);
  const system = useReducedMotion();
  return setting || system;
}
