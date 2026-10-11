import * as Application from "expo-application";
import { Platform } from "react-native";

// The desktop app names itself in its user agent ("Pawse/0.6.0 ... Electron/...").
const ua =
  Platform.OS === "web" && typeof navigator !== "undefined"
    ? navigator.userAgent
    : "";
export const desktopVersion = /\bElectron\//.test(ua)
  ? /\bPawse\/(\d+\.\d+\.\d+)/.exec(ua)?.[1]
  : undefined;
export const desktopOS = /Mac/.test(ua)
  ? "mac"
  : /Windows/.test(ua)
    ? "windows"
    : "linux";

export const appVersion =
  desktopVersion ?? Application.nativeApplicationVersion ?? "0.1.0";
/** The native build number, or which desktop the app runs on. */
export const appBuild = desktopVersion
  ? desktopOS
  : (Application.nativeBuildVersion ?? "dev");
