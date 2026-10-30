import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { useLibrary } from "../data/library";
import { appBuild, appVersion, desktopOS, desktopVersion } from "./app-version";
import { getLogLines } from "./diagnostics";

// Behaviour settings only: nothing that names the person, their accounts, library or searches.
const SETTINGS = [
  "quality",
  "qualityCellular",
  "audioFormat",
  "opusIphone",
  "normalize",
  "crossfade",
  "gapless",
  "trimSilence",
  "crossfeed",
  "smoothShuffle",
  "resume",
  "pauseOnDisconnect",
  "downloadQuality",
  "wifiOnly",
  "cacheLimitMb",
  "autoCache",
  "videos",
  "videoPreferred",
  "videoHigher",
  "videoInPlayer",
  "skipSponsors",
  "skipNonMusic",
  "dearrow",
  "androidPill",
  "region",
  "language",
] as const;

function deviceLine(): string {
  if (desktopVersion) return `desktop (${desktopOS})`;
  if (Platform.OS === "android") {
    const { Brand, Model, Release } = Platform.constants;
    return `${Brand} ${Model}, Android ${Release}`;
  }
  return `${Platform.OS} ${Platform.Version}`;
}

export function buildReport(): string {
  const settings = useLibrary.getState().settings as Record<string, unknown>;
  const log = getLogLines();
  return [
    `Pawse ${appVersion} (${appBuild})`,
    `Device: ${deviceLine()}`,
    `Signed in: ${settings.cookies ? "yes" : "no"}`,
    "",
    "Settings",
    ...SETTINGS.map((k) => `${k}: ${JSON.stringify(settings[k] ?? null)}`),
    "",
    `Log (${log.length} events)`,
    ...log,
  ].join("\n");
}

/** Writes the report to a text file and opens the share sheet. */
export async function sendDiagnostics(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `pawse-diagnostics-${day}.txt`);
  if (file.exists) file.delete();
  file.create();
  file.write(buildReport());
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/plain",
    UTI: "public.plain-text",
    dialogTitle: "Pawse diagnostics",
  });
}
