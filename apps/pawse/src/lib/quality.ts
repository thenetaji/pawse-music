import type { AudioQuality } from "@pawse/music-core";
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";

import { useLibrary } from "../data/library";
import { type NetworkKind, networkKind, networkStore } from "./net";
import { createSpeedGate } from "./throughput";

/** What the user picks per network; "auto" follows the connection. */
export type QualityChoice = "auto" | "high" | "saver";

let generation: string | null = null;
// Automatic drops to Low only on a measured crawl (see the gate), and only on the network it was measured on.
const gate = createSpeedGate();
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

/** A download speed seen while a song loaded (kbit/s): a run of slow ones drops Automatic to Low, one fast one restores it. */
export function noteThroughput(kbps: number, now = Date.now()): void {
  if (!gate.note(kbps, now)) return;
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
  if (gate.isLow(now) && lowOn === kind) return "saver";
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

/** The quality songs are kept offline at: the listener's own choice, never Automatic's passing step down. */
export const keepQuality = (): AudioQuality =>
  choiceFor(networkKind()) === "saver" ? "saver" : "high";

/** Automatic is playing Low because the connection was just measured slow. */
export const autoIsLow = (): boolean => {
  const kind = networkKind();
  return choiceFor(kind) === "auto" && autoQuality(kind) === "saver";
};

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
