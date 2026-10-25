import { FOCUS_HOME, FULL_HOME, setHomeSections } from "./home-sections";
import { getSetting, setSetting, useSetting } from "./settings";

/** The switches Focus mode turns on together; each can be changed on its own afterwards. */
export const FOCUS_SWITCHES = [
  "hideComments",
  "hideCounts",
  "hideUpNext",
  "plainThumbs",
  "hideSearchTrends",
] as const;
export type FocusSwitch = (typeof FOCUS_SWITCHES)[number];

// Before Focus mode, one "calm watch page" switch hid comments, counts and Up next.
const calmDefault = (k: FocusSwitch) =>
  k === "hideComments" || k === "hideCounts" || k === "hideUpNext"
    ? getSetting("videoCalm", false)
    : false;

export const focusOn = (k: FocusSwitch) => getSetting(k, calmDefault(k));

/** What the watch page, cards and search leave out. */
export function useFocus() {
  const calm = useSetting("videoCalm", false);
  return {
    comments: !useSetting("hideComments", calm),
    counts: !useSetting("hideCounts", calm),
    upNext: !useSetting("hideUpNext", calm),
    plainThumbs: useSetting("plainThumbs", false),
    trends: !useSetting("hideSearchTrends", false),
  };
}

export const useFocusMode = () => useSetting("focusMode", false);

/** Focus mode on: everything distracting off, autoplay off, Home only what you chose; off brings the full app back. */
export function setFocusMode(on: boolean) {
  setSetting("focusMode", on);
  for (const k of FOCUS_SWITCHES) setSetting(k, on);
  setSetting("videoCalm", false);
  if (on) setSetting("videoAutoplay", false);
  setHomeSections(on ? FOCUS_HOME : FULL_HOME);
}

// A still from the middle of the video, instead of a thumbnail made to be clicked.
export const plainThumb = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hq2.jpg`;

// Minutes of watching before the break reminder; 0 is off.
let watched = 0;
let lastTick = 0;
/** Counts seconds of playback; true once the break reminder is due. */
export function noteWatching(): boolean {
  const limit = getSetting<number>("breakMinutes", 0) * 60;
  const now = Date.now();
  // Gaps over a minute (paused, closed) don't count.
  const step = now - lastTick < 60_000 ? (now - lastTick) / 1000 : 0;
  lastTick = now;
  if (!limit) return false;
  watched += step;
  if (watched < limit) return false;
  watched = 0;
  return true;
}
