// Videos stay in step with your YouTube account both ways: what you watch here goes to YouTube's
// history with your spot, and what you watched in the YouTube app shows up here.
import type { WatchReport } from "@pawse/innertube";
import { AppState } from "react-native";

import { useLibrary } from "../data/library";
import { YT_VISITOR_KEY } from "../data/clients";
import { kv } from "../data/storage";
import { mergeYouTubeHistory } from "../data/watched";
import { ytv } from "./engine";
import { forgetOffered, RECENT_KEY } from "./for-you";
import { dayEnd } from "./history-days";
import { learnsFromWatching } from "./learn";
import { refreshResources } from "./use-resource";

// Coming back to the app reads the history again, at most this often.
const AGAIN_MS = 2 * 60_000;

// Videos within a day keep YouTube's order, a minute apart.
const STEP_MS = 60_000;

let last = 0;
let busy = false;

/** Reads your YouTube watch history into Watched and Continue; quietly does nothing signed out. */
export async function syncYouTubeHistory(force = false): Promise<boolean> {
  if (!useLibrary.getState().settings.cookies || busy) return true;
  if (!force && Date.now() - last < AGAIN_MS) return true;
  busy = true;
  try {
    const page = await ytv.history();
    const now = Date.now();
    let prev = now;
    const items = page.items.map(({ video, day }) => {
      const end = dayEnd(day, now);
      // Strictly older than the one above it, so YouTube's order holds.
      const at = Math.min(end ?? prev, prev) - STEP_MS;
      prev = at;
      return { video, at };
    });
    mergeYouTubeHistory(items);
    last = now;
    return true;
  } catch {
    // History is a nicety; the next return to the app tries again.
    return false;
  } finally {
    busy = false;
  }
}

/** Call once at start: reads the history now and whenever the app comes back to the front. */
export function startYouTubeHistory(): () => void {
  void syncYouTubeHistory(true);
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncYouTubeHistory();
  });
  // Signing in, or the saved sign-in loading after launch.
  const off = useLibrary.subscribe((s, prev) => {
    if (s.settings.cookies && s.settings.cookies !== prev.settings.cookies)
      void syncYouTubeHistory(true);
  });
  return () => {
    sub.remove();
    off();
  };
}

/** Whether what you watch goes to YouTube: your history signed in, this phone's visitor signed out. */
export const reportsWatching = () => {
  const s = useLibrary.getState().settings;
  if (s.incognito) return false;
  return s.cookies ? s.reportPlays : learnsFromWatching();
};

/** Drops this phone's YouTube visitor so suggestions start over. */
export function resetRecommendations(): void {
  ytv.resetVisitor();
  void kv.removeItem(YT_VISITOR_KEY);
  void kv.removeItem(RECENT_KEY);
  forgetOffered();
  void refreshResources(["home:", "watch:"], ["watch:q:"]);
}

// YouTube's own player reports about this often.
const PING_MS = 30_000;

/** Puts the video in your YouTube history and keeps your spot there while it plays; returns a stop. */
export function reportWatching(
  id: string,
  time: () => number,
  playing: () => boolean,
): () => void {
  let from = time();
  let report: WatchReport | undefined;
  const send = (on: boolean) => {
    if (!report) return;
    const to = time();
    void report.progress(from, to, on).catch(() => {});
    from = to;
  };
  let live = true;
  ytv
    .watchReport(id)
    .then((r) => {
      if (!live) return;
      report = r;
      send(true);
    })
    .catch(() => {});
  const timer = setInterval(() => send(playing()), PING_MS);
  return () => {
    live = false;
    clearInterval(timer);
    send(false);
  };
}
