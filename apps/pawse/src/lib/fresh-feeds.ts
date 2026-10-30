import { AppState } from "react-native";

import { refreshForYou } from "../data/recommend";
import { refreshResources } from "./use-resource";

// Back after this long, or on a new day, the feeds load again, like YouTube's on opening.
const AWAY_MS = 30 * 60_000;
// Channel uploads, and their dots, refresh sooner.
const AWAY_SUBS_MS = 5 * 60_000;
const FEEDS = ["home:", "watch:", "explore:"];
const NOT_FEEDS = ["watch:q:"];

const day = (t: number) => new Date(t).toDateString();

/** Call once from the app root. Returns a stop function. */
export function startFreshFeeds(): () => void {
  let leftAt = 0;
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "background") leftAt = Date.now();
    else if (state === "active" && leftAt) {
      const now = Date.now();
      const away = now - leftAt;
      const newDay = day(leftAt) !== day(now);
      leftAt = 0;
      if (away > AWAY_MS || newDay) {
        void refreshResources(FEEDS, NOT_FEEDS);
        void refreshForYou();
      } else if (away > AWAY_SUBS_MS) void refreshResources(["watch:subs"]);
    }
  });
  return () => sub.remove();
}
