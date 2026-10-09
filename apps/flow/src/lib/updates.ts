import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { startActivityAsync } from "expo-intent-launcher";
import { Alert, Linking, Platform } from "react-native";
import { create } from "zustand";

import { getSetting, setSetting } from "./settings";

const RELEASES =
  "https://api.github.com/repos/thenetaji/studio/releases?per_page=30";
// Often enough that a new release shows up on the next launch, well inside GitHub's 60 requests/hour.
const CHECK_EVERY = 60 * 60 * 1000;

export type Update = { version: string; file: string; notes: string };

const EXT = Platform.OS === "ios" ? ".ipa" : ".apk";
const supported = Platform.OS === "android" || Platform.OS === "ios";
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

// Newest flow-v* release on GitHub that ships this platform's build, if it is newer than this one.
export async function checkForUpdate(): Promise<Update | null> {
  if (!supported) return null;
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
    const asset = rel?.r.assets.find((a) => a.name.endsWith(EXT));
    setSetting("updateCheckedAt", Date.now());
    if (!rel || !asset || !newer(rel.v, currentVersion())) {
      set({ kind: "current" });
      return null;
    }
    const update = {
      version: rel.v,
      file: asset.browser_download_url,
      notes: rel.r.body ?? "",
    };
    set({ kind: "available", update });
    return update;
  } catch (e) {
    set({ kind: "error", message: (e as Error).message });
    return null;
  }
}

// iOS: SideStore installs the IPA from its deep link. Android: download the APK and hand it to the installer.
export async function installUpdate(update: Update) {
  if (Platform.OS === "ios") {
    const link = `sidestore://install?url=${encodeURIComponent(update.file)}`;
    await Linking.openURL(link).catch(() =>
      Alert.alert(
        "SideStore not found",
        "Open SideStore and update Flow from My Apps.",
      ),
    );
    return;
  }
  set({ kind: "downloading", update, progress: 0 });
  try {
    const file = new File(Paths.cache, `Flow-${update.version}.apk`);
    await File.downloadFileAsync(update.file, file, {
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

// On launch, at most hourly: if a newer build is out, offer it.
export async function checkOnLaunch() {
  if (!supported) return;
  if (Date.now() - getSetting("updateCheckedAt", 0) < CHECK_EVERY) return;
  const u = await checkForUpdate();
  if (!u || getSetting("updateSkipped", "") === u.version) return;
  const how =
    Platform.OS === "ios"
      ? "Install it now through SideStore?"
      : "Download and install it now?";
  const news = highlights(u.notes);
  Alert.alert(`Flow ${u.version} is out`, news ? `${news}\n\n${how}` : how, [
    {
      text: "Skip this version",
      style: "cancel",
      onPress: () => setSetting("updateSkipped", u.version),
    },
    { text: "Later" },
    { text: "Update", onPress: () => void installUpdate(u) },
  ]);
}

// The first few bullet points of the release notes, without Markdown.
export function highlights(notes: string, max = 3): string {
  return notes
    .split("\n")
    .filter((l) => /^\s*[-*]\s/.test(l))
    .slice(0, max)
    .map(
      (l) =>
        l
          .replace(/^\s*[-*]\s+/, "• ")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\[(.+?)\]\(.+?\)/g, "$1")
          .split(/[:;.]\s/)[0],
    )
    .join("\n");
}
