import { Platform } from "react-native";

/**
 * How long a picture fades in. None on web: expo-image's fade there can leave a loaded picture at opacity 0 if the
 * component re-renders while it loads, which showed up as blank thumbnails.
 */
export const imageFade = (ms: number) => (Platform.OS === "web" ? 0 : ms);
