import type { Track } from "@pawse/music-core";
import { player, startQuiet } from "@pawse/player";
import * as Application from "expo-application";
import { startActivityAsync } from "expo-intent-launcher";
import {
  Alert,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
} from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { PawseAlarm } from "../../../modules/pawse-alarm";
import { showToast } from "../../components/toast";
import { useLibrary } from "../../data/library";
import { kv } from "../../data/storage";
import { startEngine, yt } from "../../lib/engine";
import { getSetting } from "../../lib/settings";
import { nextOccurrence } from "./alarm-core";

export type WakeSource =
  | { kind: "liked" }
  | { kind: "playlist" | "ytplaylist" | "radio"; id: string; title: string };

type AlarmState = {
  on: boolean;
  hour: number;
  minute: number;
  days: number[];
  source: WakeSource | null;
  /** The next ring, ms; checked on launch to tell when it passed while Pawse was closed. */
  nextAt: number;
};

export const useAlarm = create<AlarmState>()(
  persist(
    (): AlarmState => ({
      on: false,
      hour: 7,
      minute: 0,
      days: [1, 2, 3, 4, 5],
      source: { kind: "liked" },
      nextAt: 0,
    }),
    {
      name: "pawse.alarm.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
    },
  ),
);

const RISE_MS = 60_000;
// A ring older than this is not offered again when Pawse opens.
const OFFER_MS = 20 * 60_000;

export const sourceTitle = (s: WakeSource | null) =>
  !s ? "Pick some music" : s.kind === "liked" ? "Liked songs" : s.title;

export const alarmSupported = () => PawseAlarm.supported();

export type AlarmResult =
  | "ok"
  | "denied"
  | "notifications"
  | "exact"
  | "failed";

async function allowed(): Promise<AlarmResult> {
  if (Platform.OS === "ios")
    return (await PawseAlarm.requestAuthorization()) ? "ok" : "denied";
  if (Number(Platform.Version) >= 33) {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return "notifications";
  }
  if (!PawseAlarm.canScheduleExact()) {
    void startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", {
      data: `package:${Application.applicationId}`,
    }).catch(() => {});
    return "exact";
  }
  return "ok";
}

async function schedule(): Promise<boolean> {
  const a = useAlarm.getState();
  const name = getSetting("catName", "Mochi");
  const ok = await PawseAlarm.schedule({
    hour: a.hour,
    minute: a.minute,
    days: a.days,
    title: `${name} says good morning`,
    text: a.source ? `Tap to play ${sourceTitle(a.source)}` : "Tap to wake up",
  });
  if (ok) useAlarm.setState({ nextAt: nextOccurrence(a, Date.now()) });
  return ok;
}

export async function turnOnAlarm(): Promise<AlarmResult> {
  const result = await allowed();
  if (result !== "ok") return result;
  if (!(await schedule())) return "failed";
  useAlarm.setState({ on: true });
  return "ok";
}

export async function turnOffAlarm() {
  useAlarm.setState({ on: false, nextAt: 0 });
  await PawseAlarm.cancel();
}

export async function changeAlarm(
  patch: Partial<Pick<AlarmState, "hour" | "minute" | "days" | "source">>,
): Promise<boolean> {
  useAlarm.setState(patch);
  return !useAlarm.getState().on || (await schedule());
}

export function explainAlarm(result: AlarmResult) {
  if (result === "ok") return;
  const text: Record<Exclude<AlarmResult, "ok">, [string, string]> = {
    denied: [
      "Alarms are off for Pawse",
      "Allow alarms for Pawse in Settings so Mochi can wake you.",
    ],
    notifications: [
      "Notifications are off for Pawse",
      "Allow notifications for Pawse in Settings, then turn the alarm on again.",
    ],
    exact: [
      "One more switch",
      "Allow alarms and reminders for Pawse, then come back and turn the alarm on again.",
    ],
    failed: ["Couldn't set the alarm", "Try again in a moment."],
  };
  const [title, body] = text[result];
  Alert.alert(
    title,
    body,
    result === "failed" || result === "exact"
      ? undefined
      : [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
  );
}

async function tracksOf(s: WakeSource): Promise<Track[]> {
  const lib = useLibrary.getState();
  if (s.kind === "liked") return lib.liked;
  if (s.kind === "playlist")
    return lib.playlists.find((p) => p.id === s.id)?.tracks ?? [];
  if (s.kind === "ytplaylist") return (await yt.playlist(s.id)).tracks;
  return [];
}

let lastWake = 0;

export async function wakeUp() {
  if (Date.now() - lastWake < 120_000) return;
  lastWake = Date.now();
  PawseAlarm.dismiss();
  const source = useAlarm.getState().source;
  if (!source) return;
  try {
    await startEngine();
    startQuiet(RISE_MS);
    if (source.kind === "radio") {
      await player.playRadio({ videoId: source.id, title: source.title });
      return;
    }
    const tracks = await tracksOf(source);
    if (!tracks.length) throw new Error("empty");
    player.setShuffle(source.kind === "liked");
    await player.play(tracks, 0, {
      source: {
        type: source.kind === "liked" ? "library" : "playlist",
        title: sourceTitle(source),
      },
    });
  } catch {
    showToast("Couldn't start your wake-up music", { bad: true });
  }
}

function reconcile() {
  const a = useAlarm.getState();
  if (!a.on || !a.nextAt || Date.now() < a.nextAt) return;
  const rang = a.nextAt;
  if (a.days.length)
    useAlarm.setState({ nextAt: nextOccurrence(a, Date.now()) });
  else useAlarm.setState({ on: false, nextAt: 0 });
  // The tap may still be on its way in; offer the music only if it hasn't started.
  if (Date.now() - rang < OFFER_MS)
    setTimeout(() => {
      if (lastWake > rang) return;
      showToast("Start your wake-up music?", {
        action: { label: "Play", onPress: () => void wakeUp() },
        ms: 8000,
      });
    }, 3000);
}

export function startAlarm(): () => void {
  if (!PawseAlarm.supported()) return () => {};
  if (PawseAlarm.takePending()) void wakeUp();
  reconcile();
  const unwake = PawseAlarm.onWake(() => {
    if (PawseAlarm.takePending()) void wakeUp();
  });
  const sub = AppState.addEventListener("change", (st) => {
    if (st !== "active") return;
    if (PawseAlarm.takePending()) void wakeUp();
    reconcile();
  });
  return () => {
    unwake();
    sub.remove();
  };
}
