// Resumes Pawse after a call, a video or another app's music, if it was playing before.
// iOS does the work natively (patched AVPlayerEngine); Android watches other playback here.
import {
  onPlayerEvent,
  type PlayerStatus,
  player,
  usePlayerStore,
} from "@pawse/player";
import { Platform } from "react-native";

import { PawseActivity } from "../../../modules/pawse-activity";
import { PawseIsland } from "../../../modules/pawse-island-android";
import { useLibrary } from "../../data/library";
import { getSetting } from "../../lib/settings";

/** Other audio starting this close after a system pause marks it as an interruption. */
const NEAR_MS = 2000;
/** Long enough for our own player to drop out of the device's active list after a pause. */
const SETTLE_MS = 800;
/** A pause this soon after a user pause (UI, notification, island) is the user's. */
const USER_PAUSE_MS = 1000;
/** Other audio must stay quiet this long, so the gap between two videos doesn't wake Pawse. */
const QUIET_MS = 1500;
/** Past this, the user has moved on. */
const MAX_AWAY_MS = 30 * 60_000;

const isPlaying = (s: PlayerStatus) =>
  s === "playing" || s === "buffering" || s === "loading";

const enabled = () => getSetting<boolean>("resumeAfterInterruption", true);

let stopController: (() => void) | null = null;

/** Call once from the app root. Returns a stop function (handy for fast refresh). */
export function startResumeController(): () => void {
  if (stopController) return stopController;
  if (Platform.OS === "ios" && PawseActivity.available)
    stopController = startIos();
  else if (Platform.OS === "android" && PawseIsland.available)
    stopController = startAndroid();
  return stopController ?? (() => {});
}

// Native reads the setting from UserDefaults when an interruption ends.
function startIos(): () => void {
  let on = enabled();
  PawseActivity.setResumeAfterInterruption(on);
  const unsub = useLibrary.subscribe((s, prev) => {
    if (s.settings === prev.settings || enabled() === on) return;
    on = enabled();
    PawseActivity.setResumeAfterInterruption(on);
  });
  return () => {
    unsub();
    stopController = null;
  };
}

// Android can't tell whose playback is active, so other audio = any active player while Pawse is paused.
function startAndroid(): () => void {
  let watching = false;
  let count = 0;
  let userPauseAt = 0;
  // A pause nobody asked for, waiting to see if other audio shows up.
  let candidateAt = 0;
  let interruptedAt = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;

  const paused = () => usePlayerStore.getState().status === "paused";

  const clear = () => {
    candidateAt = interruptedAt = 0;
    clearTimeout(settle);
    clearTimeout(quiet);
  };

  const mark = () => {
    interruptedAt = candidateAt;
    candidateAt = 0;
    clearTimeout(settle);
  };

  const resumeWhenQuiet = () => {
    clearTimeout(quiet);
    if (!interruptedAt || count > 0) return;
    quiet = setTimeout(() => {
      const fresh = Date.now() - interruptedAt < MAX_AWAY_MS;
      const go = count === 0 && fresh && paused() && enabled();
      interruptedAt = 0;
      if (go) player.resume();
    }, QUIET_MS);
  };

  const watch = (on: boolean) => {
    if (on === watching) return;
    watching = on;
    if (on) PawseIsland.startOtherAudioWatch();
    else {
      PawseIsland.stopOtherAudioWatch();
      count = 0;
      clear();
    }
  };

  const unsubAudio = PawseIsland.onOtherAudio((e) => {
    const rose = e.count > count;
    count = e.count;
    if (rose && candidateAt && Date.now() - candidateAt < NEAR_MS && paused())
      mark();
    resumeWhenQuiet();
  });

  const unsubPaused = onPlayerEvent("paused", () => {
    userPauseAt = Date.now();
    clear();
  });

  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    // Playing again by any means, or another song picked, ends the interruption.
    if (isPlaying(s.status) || s.index !== prev.index) {
      clear();
      return;
    }
    if (!watching || !isPlaying(prev.status) || s.status !== "paused") return;
    const now = Date.now();
    if (now - userPauseAt < USER_PAUSE_MS) return;
    candidateAt = now;
    // Other audio already playing once our own player has dropped out of the count.
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (candidateAt && paused() && count > 0) mark();
    }, SETTLE_MS);
  });

  const unsubLibrary = useLibrary.subscribe((s, prev) => {
    if (s.settings !== prev.settings) watch(enabled());
  });

  watch(enabled());

  return () => {
    unsubAudio();
    unsubPaused();
    unsubStore();
    unsubLibrary();
    watch(false);
    stopController = null;
  };
}
