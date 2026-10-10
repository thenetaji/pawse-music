import { Directory, type File } from "expo-file-system";
import { AppState, Platform } from "react-native";

import { PawseActivity } from "../../modules/pawse-activity";
import { getSetting, setSetting } from "../lib/settings";
import { useLibrary } from "./library";

const DAY = 24 * 60 * 60 * 1000;
const MAIN = "Pawse backup.json";
const WEEKLY = /^Pawse backup (\d{4}-W\d{2})\.json$/;
const KEEP_WEEKS = 8;
export const BACKUP_LOST = "Can't reach the backup folder. Pick it again.";
// iOS only keeps a picked folder for one session, so native code bookmarks it and does the file work.
const NATIVE = Platform.OS === "ios" && PawseActivity.backupFolder;

/** Lets the user pick a folder (iCloud Drive, Drive, Files…); false when cancelled. */
export async function pickBackupFolder(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message))) return false;
    throw e;
  }
  if (NATIVE && !PawseActivity.saveBackupFolder(dir.uri))
    throw new Error("Couldn't keep access to that folder. Try another one.");
  setSetting("backupFolder", dir.uri);
  setSetting("backupFolderName", folderName(dir.uri));
  setSetting("backupError", null);
  return true;
}

export function turnOffAutoBackup() {
  for (const k of [
    "backupFolder",
    "backupFolderName",
    "backupAt",
    "backupError",
  ])
    setSetting(k, null);
  if (NATIVE) PawseActivity.clearBackupFolder();
}

let running: Promise<boolean> | null = null;

/** Writes the backup to the picked folder once a day; true when a file was written. */
export function runAutoBackup(force = false): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(false);
  const uri = getSetting<string | null>("backupFolder", null);
  if (!uri) return Promise.resolve(false);
  // Access lost: wait for the user to pick the folder again.
  if (!force && getSetting<string | null>("backupError", null))
    return Promise.resolve(false);
  if (!force && Date.now() - getSetting("backupAt", 0) < DAY)
    return Promise.resolve(false);
  running ??= write(uri).finally(() => {
    running = null;
  });
  return running;
}

async function write(uri: string): Promise<boolean> {
  try {
    const { buildBackupJson } = await import("./backup");
    const json = await buildBackupJson();
    const week = isoWeek(new Date());
    const keep = new Set(
      Array.from({ length: KEEP_WEEKS }, (_, i) =>
        isoWeek(new Date(Date.now() - i * 7 * DAY)),
      ),
    );
    if (NATIVE) await writeNative(json, week, keep);
    else writeFiles(new Directory(uri), json, week, keep);
    setSetting("backupAt", Date.now());
    setSetting("backupError", null);
    return true;
  } catch {
    setSetting("backupError", BACKUP_LOST);
    return false;
  }
}

function writeFiles(
  dir: Directory,
  json: string,
  week: string,
  keep: Set<string>,
) {
  const files = entries(dir);
  // Delete then create: SAF "w" mode can leave old bytes past the new end.
  for (const { name, file } of files) {
    const m = WEEKLY.exec(name);
    if (m && (m[1] === week || !keep.has(m[1])) && isOurs(file)) file.delete();
  }
  dir.createFile(`Pawse backup ${week}.json`, "application/json").write(json);
  for (const { name, file } of files)
    if (name === MAIN && isOurs(file)) file.delete();
  dir.createFile(MAIN, "application/json").write(json);
}

// Native writes replace atomically, so only weekly copies past the window get deleted.
async function writeNative(json: string, week: string, keep: Set<string>) {
  for (const name of await PawseActivity.listBackupFiles()) {
    const m = WEEKLY.exec(name);
    if (!m || m[1] === week || keep.has(m[1])) continue;
    if (!(await isOursNative(name))) continue;
    if (!(await PawseActivity.deleteBackupFile(name)))
      throw new Error("delete failed");
  }
  for (const name of [`Pawse backup ${week}.json`, MAIN])
    if (!(await PawseActivity.writeBackupFile(name, json)))
      throw new Error("write failed");
}

async function isOursNative(name: string): Promise<boolean> {
  const head = await PawseActivity.readBackupFileHead(name, 64);
  return !!head?.includes("pawse.library");
}

// Android SAF uris often hide the file name, so names come from info() in list order.
function entries(dir: Directory): { name: string; file: File }[] {
  const items = dir.list();
  const names = Platform.OS === "android" ? (dir.info().files ?? []) : [];
  const out: { name: string; file: File }[] = [];
  items.forEach((item, i) => {
    if (item instanceof Directory) return;
    const name = names.length === items.length ? names[i] : lastName(item.uri);
    out.push({ name, file: item });
  });
  return out;
}

// Never delete a user's own file that happens to share the name.
function isOurs(file: File): boolean {
  try {
    const h = file.open();
    try {
      const head = String.fromCharCode(...Array.from(h.readBytes(64)));
      return head.includes("pawse.library");
    } finally {
      h.close();
    }
  } catch {
    return false;
  }
}

function lastName(uri: string): string {
  let s = uri.replace(/\/+$/, "");
  s = s.slice(s.lastIndexOf("/") + 1);
  try {
    s = decodeURIComponent(s);
  } catch {}
  return s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf(":")) + 1);
}

function folderName(uri: string): string {
  if (uri.includes("com.google.android.apps.docs")) return "Google Drive";
  if (uri.includes("com.android.providers.downloads")) return "Downloads";
  const name = lastName(uri);
  if (!name || name.includes("=") || name.length > 40) return "Folder";
  return name === "com~apple~CloudDocs" ? "iCloud Drive" : name;
}

// ISO 8601 week, e.g. "2026-W41".
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - jan1) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Backs up once after the library loads and each time the app goes to the background. */
export function startAutoBackup(): () => void {
  if (Platform.OS === "web") return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    timer = setTimeout(() => void runAutoBackup(), 5000);
  };
  if (useLibrary.persist.hasHydrated()) kick();
  const unhydrate = useLibrary.persist.onFinishHydration(kick);
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "background") void runAutoBackup();
  });
  return () => {
    clearTimeout(timer);
    unhydrate();
    sub.remove();
  };
}
