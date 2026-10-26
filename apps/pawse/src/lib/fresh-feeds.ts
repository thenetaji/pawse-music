import { AppState } from "react-native";

import { refreshResources } from "./use-resource";

// Back after this long, the feeds load again, like YouTube's on opening; a quick app switch keeps them.
const AWAY_MS = 5 * 60_000;
const FEEDS = ["home:", "watch:", "explore:"];

/** Call once from the app root. Returns a stop function. */
export function startFreshFeeds(): () => void {
  let leftAt = 0;
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "background") leftAt = Date.now();
    else if (state === "active" && leftAt && Date.now() - leftAt > AWAY_MS) {
      leftAt = 0;
      void refreshResources(FEEDS);
    }
  });
  return () => sub.remove();
}
