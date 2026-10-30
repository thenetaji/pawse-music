import { currentOnPlaylist, usePlayerSelect } from "@pawse/player";
import { Platform } from "react-native";

import { PawseAudio } from "../../../modules/pawse-audio";
import { useSetting } from "../settings";
import { DEFAULT_EQ, type EqSetting } from "./eq";
import { bypassesTap, type EqStatus, eqStatus } from "./eq-status";

const useSong = () => ({
  hasTrack: usePlayerSelect((s) => s.current != null),
  onPlaylist: usePlayerSelect(() => currentOnPlaylist()),
});

/** Whether the level meter can hear the current song. */
export function useMeterable(): boolean {
  const { hasTrack, onPlaylist } = useSong();
  return (
    PawseAudio.available &&
    hasTrack &&
    !bypassesTap({ ios: Platform.OS === "ios", onPlaylist })
  );
}

export function useEqStatus(): EqStatus {
  const eq = useSetting<EqSetting>("eq", DEFAULT_EQ);
  const { hasTrack, onPlaylist } = useSong();
  return eqStatus({
    available: PawseAudio.available,
    eq,
    hasTrack,
    onPlaylist,
    ios: Platform.OS === "ios",
  });
}
