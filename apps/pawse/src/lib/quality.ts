import type { AudioQuality } from "@pawse/music-core";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";

import { useLibrary } from "../data/library";
import { type NetworkKind, networkKind, networkStore } from "./net";

/** What the user picks per network; "auto" follows the connection. */
export type QualityChoice = "auto" | "high" | "saver";

// Two stalls within 10 minutes drop Automatic to Low for 15 minutes on that network.
const STALL_WINDOW_MS = 10 * 60_000;
const STALLS_TO_DROP = 2;
const LOW_FOR_MS = 15 * 60_000;

let generation: string | null = null;
let stalls: number[] = [];
let lowUntil = 0;
let lowOn: NetworkKind | null = null;
const listeners = new Set<() => void>();
const bump = () => {
  for (const l of listeners) l();
};

NetInfo.addEventListener((s) => {
  const g =
    s.type === "cellular" ? (s.details?.cellularGeneration ?? null) : null;
  if (g !== generation) {
    generation = g;
    bump();
  }
});
networkStore.subscribe(bump);
useLibrary.subscribe((s, prev) => {
  if (
    s.settings.quality !== prev.settings.quality ||
    s.settings.qualityCellular !== prev.settings.qualityCellular
  )
    bump();
});

/** Called when playback stalls; repeated stalls make Automatic play it safe for a while. */
export function noteStall(now = Date.now()): void {
  stalls = stalls.filter((t) => now - t < STALL_WINDOW_MS);
  stalls.push(now);
  if (stalls.length < STALLS_TO_DROP) return;
  stalls = [];
  lowUntil = now + LOW_FOR_MS;
  lowOn = networkKind();
  bump();
}

const choiceFor = (kind: NetworkKind): QualityChoice => {
  const s = useLibrary.getState().settings;
  const c = kind === "cellular" ? s.qualityCellular : s.quality;
  return c === "saver" || c === "high" ? c : "auto";
};

/** Quality Automatic resolves to on this network right now. */
export function autoQuality(kind: NetworkKind, now = Date.now()): AudioQuality {
  if (now < lowUntil && lowOn === kind) return "saver";
  if (kind === "cellular" && (generation === "2g" || generation === "3g"))
    return "saver";
  return "high";
}

/** The stream quality to request now, from the user's choice for the current network. */
export function effectiveQuality(): AudioQuality {
  const kind = networkKind();
  const c = choiceFor(kind);
  return c === "auto" ? autoQuality(kind) : c;
}

/** On mobile data at Low: smaller artwork, nothing kept offline, only the next song prepared. */
export const isLowData = () =>
  networkKind() === "cellular" && effectiveQuality() === "saver";

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useLowData(): boolean {
  return useSyncExternalStore(subscribe, isLowData, () => false);
}

const autoPair = () => `${autoQuality("wifi")}|${autoQuality("cellular")}`;

/** What Automatic would play on Wi-Fi and on mobile data right now, for Settings. */
export function useAutoQuality(): Record<"wifi" | "cellular", AudioQuality> {
  const [wifi, cellular] = useSyncExternalStore(
    subscribe,
    autoPair,
    () => "high|high",
  ).split("|") as [AudioQuality, AudioQuality];
  return { wifi, cellular };
}
