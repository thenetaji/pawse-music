import { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

/** The width pages lay out in: the window on phones, the area beside the sidebar on desktop. */
export const ContentWidth = createContext<number | null>(null);

export function useContentWidth(): number {
  const inShell = useContext(ContentWidth);
  const { width } = useWindowDimensions();
  return inShell ?? width;
}
