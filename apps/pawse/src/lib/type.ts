import { Platform, type TextStyle } from "react-native";

// Android's default font looks generic next to iOS's SF Pro; Inter (embedded at build time) is the closest open match.
const INTER = {
  "700": "Inter_700Bold",
  "800": "Inter_800ExtraBold",
  "900": "Inter_800ExtraBold",
} as const;

/** Heading weight: SF Pro on iOS, Inter on Android (the family carries the weight there). */
export function display(weight: keyof typeof INTER): TextStyle {
  if (Platform.OS !== "android") return { fontWeight: weight };
  return { fontFamily: INTER[weight], fontWeight: "normal" };
}
