import { useEffect } from "react";
import { makeMutable } from "react-native-reanimated";

import { watchBars } from "../../lib/audio-fx/bars";
import { useMeterable } from "../../lib/audio-fx/use-eq-status";
import {
  amplitude,
  beatLocked,
  DEFAULT_AMP,
  DEFAULT_BEAT_MS,
  newBeat,
  stepBeat,
} from "./beat";

/** The song's beat as the cats on screen need it: written here, read on the UI thread. */
export const beatFeed = {
  beatMs: makeMutable(DEFAULT_BEAT_MS),
  amp: makeMutable(DEFAULT_AMP),
  locked: makeMutable(false),
  onsetAt: makeMutable(0),
};

const holds = new Set<{ meterable: boolean }>();
let stop: (() => void) | undefined;

function resetFeed() {
  beatFeed.beatMs.set(DEFAULT_BEAT_MS);
  beatFeed.amp.set(DEFAULT_AMP);
  beatFeed.locked.set(false);
}

function listen() {
  let state = newBeat(Date.now());
  return watchBars((bands) => {
    if (!bands) {
      state = newBeat(Date.now());
      resetFeed();
      return;
    }
    const now = Date.now();
    const step = stepBeat(state, bands, now);
    state = step.state;
    beatFeed.beatMs.set(state.beatMs);
    beatFeed.amp.set(amplitude(state.energy));
    beatFeed.locked.set(beatLocked(state));
    if (step.onset) beatFeed.onsetAt.set(now);
  });
}

function sync() {
  const want = [...holds].some((h) => h.meterable);
  if (want && !stop) stop = listen();
  if (!want) {
    stop?.();
    stop = undefined;
    resetFeed();
  }
}

/** Starts reading the beat from the level meter while something needs it; the meter runs once however many cats listen. */
export function holdBeat(meterable: boolean): () => void {
  const hold = { meterable };
  holds.add(hold);
  sync();
  return () => {
    holds.delete(hold);
    sync();
  };
}

/** Keeps the beat feed running while `active`. */
export function useBeatFeed(active: boolean) {
  const meterable = useMeterable();
  useEffect(
    () => (active ? holdBeat(meterable) : undefined),
    [active, meterable],
  );
}
