// JS side of the PawseAlarm module (AlarmKit on iOS 26+, AlarmManager on Android). Every call is a safe no-op without it.
import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export interface AlarmPlan {
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6; empty rings once. */
  days: number[];
  title: string;
  text: string;
}

type Events = { onWake(): void };

declare class PawseAlarmNative extends NativeModule<Events> {
  isSupported(): boolean;
  requestAuthorization(): Promise<boolean>;
  takePending(): boolean;
  canScheduleExact(): boolean;
  canUseFullScreen(): boolean;
  dismiss(): void;
  cancel(): void | Promise<void>;
  schedule(
    hour: number,
    minute: number,
    days: number[],
    title: string,
    text?: string,
  ): boolean | Promise<boolean>;
}

const native =
  Platform.OS === "ios" || Platform.OS === "android"
    ? requireOptionalNativeModule<PawseAlarmNative>("PawseAlarm")
    : null;

function safe<T>(run: (n: PawseAlarmNative) => T, fallback: T): T {
  try {
    return native ? run(native) : fallback;
  } catch {
    return fallback;
  }
}

export const PawseAlarm = {
  supported: () => safe((n) => n.isSupported(), false),

  async requestAuthorization(): Promise<boolean> {
    try {
      return (await native?.requestAuthorization()) ?? false;
    } catch {
      return false;
    }
  },

  canScheduleExact: () => safe((n) => n.canScheduleExact(), false),

  canUseFullScreen: () => safe((n) => n.canUseFullScreen(), true),

  async schedule(p: AlarmPlan): Promise<boolean> {
    try {
      if (!native) return false;
      return await (Platform.OS === "ios"
        ? native.schedule(p.hour, p.minute, p.days, p.title)
        : native.schedule(p.hour, p.minute, p.days, p.title, p.text));
    } catch {
      return false;
    }
  },

  async cancel(): Promise<void> {
    try {
      await native?.cancel();
    } catch {
      // Nothing was scheduled.
    }
  },

  takePending: () => safe((n) => n.takePending(), false),

  dismiss: () => safe((n) => n.dismiss(), undefined),

  onWake(cb: () => void): () => void {
    if (Platform.OS !== "ios") return () => {};
    const sub = native?.addListener("onWake", cb);
    return () => sub?.remove();
  },
};
