import * as Application from "expo-application";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { kv } from "../data/storage";

// The last few hundred playback moments, kept on the phone so a bug report can include them.
const KEY = "flow.diagnostics.v1";
const MAX = 300;
let lines: string[] = [];
try {
  const raw = kv.getItem(KEY);
  if (typeof raw === "string") lines = JSON.parse(raw);
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
    `${new Date().toISOString()} ${kind}${detail ? ` ${detail}` : ""}`,
  );
  if (lines.length > MAX) lines = lines.slice(-MAX);
  changed();
}

export function getLogText(): string {
  const head = `Pawse ${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"}) · ${Platform.OS} ${Platform.Version}`;
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
