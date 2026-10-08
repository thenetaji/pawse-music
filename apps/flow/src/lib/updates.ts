import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { startActivityAsync } from "expo-intent-launcher";
import { Alert, Platform } from "react-native";
import { create } from "zustand";

import { getSetting, setSetting } from "./settings";

const RELEASES =
  "https://api.github.com/repos/thenetaji/studio/releases?per_page=30";
const DAY = 24 * 60 * 60 * 1000;

export type Update = { version: string; apk: string; notes: string };
type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; progress: number }
  | { kind: "error"; message: string };

export const useUpdate = create<State>(() => ({ kind: "idle" }));
const set = (s: State) => useUpdate.setState(s, true);

export const currentVersion = () =>
  Application.nativeApplicationVersion ?? "0.0.0";

const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body?: string;
  assets: { name: string; browser_download_url: string }[];
};

// Newest flow-v* release on GitHub that ships an APK, if it is newer than this build.
export async function checkForUpdate(): Promise<Update | null> {
  if (Platform.OS !== "android") return null;
  set({ kind: "checking" });
  try {
    const res = await fetch(RELEASES, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub said ${res.status}`);
    const list = (await res.json()) as Release[];
    const rel = list
      .filter(
        (r) => !r.draft && !r.prerelease && r.tag_name.startsWith("flow-v"),
      )
      .map((r) => ({ r, v: r.tag_name.slice(6) }))
      .sort((a, b) => (newer(a.v, b.v) ? -1 : 1))[0];
    const apk = rel?.r.assets.find((a) => a.name.endsWith(".apk"));
    setSetting("updateCheckedAt", Date.now());
    if (!rel || !apk || !newer(rel.v, currentVersion())) {
      set({ kind: "current" });
      return null;
    }
    const update = {
      version: rel.v,
      apk: apk.browser_download_url,
      notes: rel.r.body ?? "",
    };
    set({ kind: "available", update });
    return update;
  } catch (e) {
    set({ kind: "error", message: (e as Error).message });
    return null;
  }
}

// Downloads the APK and hands it to Android's installer (same signing key, so it installs over).
export async function installUpdate(update: Update) {
  set({ kind: "downloading", update, progress: 0 });
  try {
    const file = new File(Paths.cache, `Flow-${update.version}.apk`);
    await File.downloadFileAsync(update.apk, file, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) =>
        totalBytes > 0 &&
        set({
          kind: "downloading",
          update,
          progress: bytesWritten / totalBytes,
        }),
    });
    set({ kind: "available", update });
    await startActivityAsync("android.intent.action.VIEW", {
      data: file.contentUri,
      type: "application/vnd.android.package-archive",
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
  } catch (e) {
    set({ kind: "error", message: (e as Error).message });
    Alert.alert("Update failed", (e as Error).message);
  }
}

// Once a day on launch: if a newer APK is out, offer it.
export async function checkOnLaunch() {
  if (Platform.OS !== "android") return;
  if (Date.now() - getSetting("updateCheckedAt", 0) < DAY) return;
  const u = await checkForUpdate();
  if (!u || getSetting("updateSkipped", "") === u.version) return;
  Alert.alert(`Flow ${u.version} is out`, "Download and install it now?", [
    {
      text: "Skip this version",
      style: "cancel",
      onPress: () => setSetting("updateSkipped", u.version),
    },
    { text: "Later" },
    { text: "Update", onPress: () => void installUpdate(u) },
  ]);
}
