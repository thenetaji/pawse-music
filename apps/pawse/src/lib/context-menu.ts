import { Platform } from "react-native";

/** Right-click opens what a long press opens on a phone; spread onto a Pressable (only the web build has a mouse). */
export function rightClick(open: () => void): object {
  if (Platform.OS !== "web") return {};
  return {
    onContextMenu: (e: { preventDefault(): void }) => {
      e.preventDefault();
      open();
    },
  };
}

/** Desktop shows a "⋯" button where phones rely on a swipe. */
export const hasMouse = Platform.OS === "web";
