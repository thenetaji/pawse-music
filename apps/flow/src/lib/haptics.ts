import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const on = Platform.OS !== "web";
export const haptic = {
  tick: () => on && void Haptics.selectionAsync(),
  light: () =>
    on && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () =>
    on && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  soft: () => on && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  success: () =>
    on &&
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};
