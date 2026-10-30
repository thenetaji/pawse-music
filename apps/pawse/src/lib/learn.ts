import { getSetting } from "./settings";

/** Whether YouTube may learn from what you watch while signed out. */
export const learnsFromWatching = () =>
  getSetting("learnFromWatching", true) && !getSetting("incognito", false);
