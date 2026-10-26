import * as ScreenOrientation from "expo-screen-orientation";
import { Platform } from "react-native";

// Pawse is a portrait app; only a full-screen video turns sideways, the real way, so iPhone
// hides the status bar and home bar like it does for YouTube.
const lock = (o: ScreenOrientation.OrientationLock) => {
  if (Platform.OS === "web") return;
  ScreenOrientation.lockAsync(o).catch(() => {});
};

export const lockPortrait = () =>
  lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
export const lockLandscape = () =>
  lock(ScreenOrientation.OrientationLock.LANDSCAPE);

/** The watch page lets the phone turn, so turning it sideways can go full screen. */
export const allowRotation = () =>
  lock(ScreenOrientation.OrientationLock.DEFAULT);

const SIDEWAYS = new Set([
  ScreenOrientation.Orientation.LANDSCAPE_LEFT,
  ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
]);

/** Calls back with true when the screen turns sideways, false when it turns upright. */
export function onTurn(cb: (sideways: boolean) => void): () => void {
  if (Platform.OS === "web") return () => {};
  const sub = ScreenOrientation.addOrientationChangeListener((e) =>
    cb(SIDEWAYS.has(e.orientationInfo.orientation)),
  );
  return () => ScreenOrientation.removeOrientationChangeListener(sub);
}
