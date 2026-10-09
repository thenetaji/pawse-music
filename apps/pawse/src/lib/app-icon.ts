// Home screen icon choice. iOS only (see plugins/with-ios-app-icons.js); app-icon.web.ts previews it.
import {
  getAppIconName,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from "expo-alternate-app-icons";
import { Platform } from "react-native";

import type { AppIconId } from "./app-icons";

export { APP_ICONS, type AppIconId } from "./app-icons";

// Android has the module too, but switching there disables MainActivity, so it stays iOS only.
export const appIconsSupported =
  Platform.OS === "ios" && supportsAlternateIcons;

export function currentAppIcon(): AppIconId {
  if (!appIconsSupported) return null;
  try {
    return (getAppIconName() as AppIconId) ?? null;
  } catch {
    return null;
  }
}

/** Switches the home screen icon; iOS confirms with its own alert. */
export async function setAppIcon(id: AppIconId): Promise<boolean> {
  if (!appIconsSupported) return false;
  try {
    await setAlternateAppIcon(id as never);
    return true;
  } catch {
    return false;
  }
}
