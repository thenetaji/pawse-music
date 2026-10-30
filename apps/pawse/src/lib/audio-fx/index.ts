import { PawseAudio } from "../../../modules/pawse-audio";
import { useLibrary } from "../../data/library";
import { chainFor } from "./eq";

let holders = 0;
let started = false;

const trimNeedsMeter = () =>
  !!useLibrary.getState().settings.trimSilence && !PawseAudio.skipsSilence;

function syncMeter() {
  PawseAudio.setMeter(holders > 0 || trimNeedsMeter());
}

export function startAudioFx() {
  if (started || !PawseAudio.available) return;
  started = true;
  let last: unknown[] = [];
  const push = () => {
    const s = useLibrary.getState().settings;
    const next = [s.eq, s.crossfeed, s.trimSilence];
    if (next.every((v, i) => v === last[i])) return;
    last = next;
    PawseAudio.setChain(chainFor(s.eq));
    PawseAudio.setCrossfeed(!!s.crossfeed);
    if (!s.trimSilence) PawseAudio.setSkipSilence(false);
    syncMeter();
  };
  push();
  useLibrary.subscribe(push);
}

// The level meter runs only while something is looking at it (the visualiser, or silence trimming on).
export function holdMeter(): () => void {
  holders++;
  syncMeter();
  return () => {
    holders--;
    syncMeter();
  };
}

export const levelsAvailable = PawseAudio.available;

export const readLevels = () => PawseAudio.levels();

export const trimSilence = {
  on: () => !!useLibrary.getState().settings.trimSilence,
  skip: PawseAudio.skipsSilence
    ? (on: boolean) => PawseAudio.setSkipSilence(on)
    : undefined,
  silentMs: PawseAudio.available
    ? () => PawseAudio.levels()?.silentMs
    : undefined,
};
