import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { kv } from "../../data/storage";
import { getSetting } from "../../lib/settings";
import { addSeconds, dayKey, MORE_SEC, secondsLeft } from "./mindful-core";

type MindfulState = {
  days: Record<string, number>;
  more: { day: string; sec: number };
  warnedDay: string;
};

export const useMindful = create<MindfulState>()(
  persist(() => ({ days: {}, more: { day: "", sec: 0 }, warnedDay: "" }), {
    name: "pawse.mindful.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);

export const useMindfulCard = create<{ open: boolean }>(() => ({
  open: false,
}));
export const showMindfulCard = () => useMindfulCard.setState({ open: true });
export const hideMindfulCard = () => useMindfulCard.setState({ open: false });

const moreToday = (s: MindfulState, now: number) =>
  s.more.day === dayKey(now) ? s.more.sec : 0;

export const useWatchedToday = () =>
  useMindful((s) => s.days[dayKey(Date.now())] ?? 0);

export function leftToday(now = Date.now()): number {
  const s = useMindful.getState();
  return secondsLeft(
    getSetting("mindfulLimit", 0),
    moreToday(s, now),
    s.days[dayKey(now)] ?? 0,
  );
}

export const videosBlocked = (now = Date.now()) => leftToday(now) <= 0;

export const addWatchSeconds = (sec: number, now = Date.now()) =>
  useMindful.setState((s) => ({ days: addSeconds(s.days, dayKey(now), sec) }));

export const grantMoreTime = (now = Date.now()) =>
  useMindful.setState((s) => ({
    more: { day: dayKey(now), sec: moreToday(s, now) + MORE_SEC },
  }));

export const markWarned = (now = Date.now()) =>
  useMindful.setState({ warnedDay: dayKey(now) });
