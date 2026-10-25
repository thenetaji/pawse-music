import { Platform, useWindowDimensions } from "react-native";

import { useWatch } from "./store";
import { FloatingWatchMini } from "./watch-mini";
import { WatchSession } from "./watch-session";

// Matches DESKTOP_MIN_WIDTH in the desktop shell (not imported: that file is web-only).
const DESKTOP_MIN = 900;

/** Lives above the whole app: the video being watched, full screen or waiting in the mini player. */
export function WatchHost() {
  const id = useWatch((s) => s.id);
  const mini = useWatch((s) => s.mode === "mini");
  const { width } = useWindowDimensions();
  if (!id) return null;
  return (
    <>
      <WatchSession key={id} id={id} />
      {mini && Platform.OS === "web" && width >= DESKTOP_MIN ? (
        <FloatingWatchMini />
      ) : null}
    </>
  );
}
