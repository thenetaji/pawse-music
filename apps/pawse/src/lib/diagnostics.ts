import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { kv } from "../data/storage";
import { appBuild, appVersion, desktopVersion } from "./app-version";

// The last few hundred playback moments, kept on the phone so a bug report can include them.
const KEY = "pawse.diagnostics.v1";
const MAX = 300;
// Error text can carry request URLs and tokens; keep what happened, not who it happened to.
function scrub(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?"')]+)\?[^\s"')]*/g, "$1?…")
    .replace(
      /\b(cookie|authorization|bearer|token|sapisid|sig)([=:]\s*)\S+/gi,
      "$1$2…",
    )
    .replace(/[\w-]{32,}/g, "…");
}

let lines: string[] = [];
try {
  const raw = kv.getItem(KEY);
  if (typeof raw === "string") lines = (JSON.parse(raw) as string[]).map(scrub);
} catch {}
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function changed() {
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void kv.set(KEY, JSON.stringify(lines)), 2000);
}

export function logEvent(kind: string, detail?: string): void {
  lines.push(
    scrub(`${new Date().toISOString()} ${kind}${detail ? ` ${detail}` : ""}`),
  );
  if (lines.length > MAX) lines = lines.slice(-MAX);
  changed();
}

export function getLogLines(): string[] {
  return lines;
}

export function getLogText(): string {
  const where = desktopVersion
    ? "desktop"
    : `${Platform.OS} ${Platform.Version}`;
  const head = `Pawse ${appVersion} (${appBuild}) · ${where}`;
  return [head, ...lines].join("\n");
}

export function clearLog(): void {
  lines = [];
  changed();
}

export function useLogCount(): number {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => lines.length,
    () => 0,
  );
}
