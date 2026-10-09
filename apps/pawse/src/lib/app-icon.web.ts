// Web preview of the icon picker; nothing changes outside the page.
import type { AppIconId } from "./app-icons";

export { APP_ICONS, type AppIconId } from "./app-icons";

export const appIconsSupported = true;

let icon: AppIconId = null;
export const currentAppIcon = (): AppIconId => icon;
export async function setAppIcon(id: AppIconId): Promise<boolean> {
  icon = id;
  return true;
}
