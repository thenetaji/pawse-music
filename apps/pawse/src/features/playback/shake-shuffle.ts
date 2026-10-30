// Shake the phone to reshuffle what's up next. The accelerometer is read only while the setting is on,
// the app is in front and something is playing, so it costs nothing the rest of the time.
import { usePlayerStore } from "@pawse/player";
import { AppState, Platform } from "react-native";

import { showToast } from "../../components/toast";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { getSetting } from "../../lib/settings";
import { makeShakeDetector } from "../../lib/shake";
import { reshuffleUpcoming } from "../../lib/smooth-queue";

const SAMPLE_MS = 40;

// Loaded on demand, so a build without the sensors module still starts, just without the shake.
const sensors = () => import("expo-sensors").catch(() => undefined);

const wanted = () => {
  const status = usePlayerStore.getState().status;
  return (
    getSetting("shakeShuffle", false) &&
    AppState.currentState === "active" &&
    (status === "playing" || status === "buffering")
  );
};

/** Call once from the app root. Returns a stop function. */
export function startShakeShuffle(): () => void {
  if (Platform.OS === "web") return () => {};
  const detect = makeShakeDetector();
  let listener: { remove: () => void } | undefined;
  let starting = false;

  const stopListening = () => {
    listener?.remove();
    listener = undefined;
  };
  const sync = async () => {
    if (!wanted()) return stopListening();
    if (listener || starting) return;
    starting = true;
    const m = await sensors();
    starting = false;
    // The conditions may have changed while the module loaded.
    if (!m || listener || !wanted()) return;
    m.Accelerometer.setUpdateInterval(SAMPLE_MS);
    listener = m.Accelerometer.addListener((a) => {
      if (!detect(a, Date.now()) || !reshuffleUpcoming()) return;
      haptic.success();
      showToast("Shuffled");
    });
  };

  const app = AppState.addEventListener("change", () => void sync());
  const offPlayer = usePlayerStore.subscribe((s, prev) => {
    if (s.status !== prev.status) void sync();
  });
  const offSetting = useLibrary.subscribe((s, prev) => {
    if (s.settings !== prev.settings) void sync();
  });
  void sync();
  return () => {
    app.remove();
    offPlayer();
    offSetting();
    stopListening();
  };
}
