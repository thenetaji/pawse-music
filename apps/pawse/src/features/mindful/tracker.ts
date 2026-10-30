import { showToast } from "../../components/toast";
import { getSetting } from "../../lib/settings";
import { useWatch } from "../watch/store";
import { dayKey, WARN_SEC } from "./mindful-core";
import {
  addWatchSeconds,
  leftToday,
  markWarned,
  showMindfulCard,
  useMindful,
} from "./mindful-state";

const FLUSH_EVERY = 10;
// A longer gap means iOS suspended the app, not that the video kept playing.
const MAX_GAP_MS = 15_000;

export function startMindfulTracker(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let since = 0;
  let pending = 0;
  let ticks = 0;

  const fold = () => {
    const now = Date.now();
    pending += Math.min(now - since, MAX_GAP_MS) / 1000;
    since = now;
  };
  const flush = () => {
    if (pending <= 0) return;
    addWatchSeconds(pending);
    pending = 0;
  };

  const tick = () => {
    fold();
    if (++ticks % FLUSH_EVERY === 0) flush();
    const left = leftToday() - pending;
    if (left <= 0) {
      flush();
      useWatch.getState().player?.pause();
      showMindfulCard();
    } else if (
      left <= WARN_SEC &&
      useMindful.getState().warnedDay !== dayKey(Date.now())
    ) {
      markWarned();
      const name = getSetting("catName", "Mochi");
      showToast(`5 minutes of video left today. ${name} is getting sleepy.`, {
        ms: 5000,
      });
    }
  };

  const sync = (playing: boolean) => {
    if (timer) {
      fold();
      clearInterval(timer);
      timer = undefined;
      flush();
    }
    if (!playing) return;
    since = Date.now();
    timer = setInterval(tick, 1000);
  };

  sync(useWatch.getState().playing);
  const unsub = useWatch.subscribe((s, prev) => {
    if (s.playing !== prev.playing) sync(s.playing);
  });
  return () => {
    unsub();
    sync(false);
  };
}
