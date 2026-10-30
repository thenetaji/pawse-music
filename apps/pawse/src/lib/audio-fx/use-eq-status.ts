import { currentOnPlaylist, usePlayerSelect } from "@pawse/player";
import { Platform } from "react-native";

import { PawseAudio } from "../../../modules/pawse-audio";
import { useSetting } from "../settings";
import { DEFAULT_EQ, type EqSetting } from "./eq";
import { type EqStatus, eqStatus } from "./eq-status";

export function useEqStatus(): EqStatus {
  const eq = useSetting<EqSetting>("eq", DEFAULT_EQ);
  const hasTrack = usePlayerSelect((s) => s.current != null);
  const onPlaylist = usePlayerSelect(() => currentOnPlaylist());
  return eqStatus({
    available: PawseAudio.available,
    eq,
    hasTrack,
    onPlaylist,
    ios: Platform.OS === "ios",
  });
}
