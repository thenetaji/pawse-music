import {
  amplitude,
  beatLocked,
  DEFAULT_BEAT_MS,
  foldBeat,
  newBeat,
  stepBeat,
  tempoSpeed,
} from "./beat";

const FRAME = 33;

// A kick every `every` ms over a quiet floor, `seconds` long.
function play(every: number, seconds: number, kick = 0.9, floor = 0.1) {
  let state = newBeat(0);
  let onsets = 0;
  for (let t = FRAME; t <= seconds * 1000; t += FRAME) {
    const hit = t % every < FRAME;
    const bands = [
      hit ? kick : floor,
      hit ? kick : floor,
      floor,
      ...Array(13).fill(floor),
    ];
    const r = stepBeat(state, bands, t);
    state = r.state;
    if (r.onset) onsets++;
  }
  return { state, onsets };
}

describe("foldBeat", () => {
  it("keeps a usable beat as it is", () => {
    expect(foldBeat(500)).toBe(500);
  });
  it("halves a slow gap and doubles a fast one", () => {
    expect(foldBeat(1000)).toBe(500);
    expect(foldBeat(250)).toBe(500);
  });
});

describe("stepBeat", () => {
  it("finds the tempo of steady kicks", () => {
    const { state, onsets } = play(500, 12);
    expect(beatLocked(state)).toBe(true);
    expect(state.beatMs).toBeGreaterThan(470);
    expect(state.beatMs).toBeLessThan(530);
    expect(onsets).toBeGreaterThan(20);
  });

  it("reads kicks every other beat as the same tempo", () => {
    const { state } = play(1000, 20);
    expect(state.beatMs).toBeGreaterThan(470);
    expect(state.beatMs).toBeLessThan(530);
  });

  it("keeps the default tempo until it has heard enough", () => {
    const { state } = play(500, 1.2);
    expect(beatLocked(state)).toBe(false);
    expect(state.beatMs).toBe(DEFAULT_BEAT_MS);
  });

  it("hears no kicks in a steady bass, apart from the song starting", () => {
    const { onsets } = play(1_000_000, 5, 0.1, 0.5);
    expect(onsets).toBeLessThanOrEqual(1);
  });

  it("forgets the gaps after a long silence", () => {
    let { state } = play(500, 6);
    const quiet = Array(16).fill(0.05);
    for (let t = 6000 + FRAME; t < 10_000; t += FRAME)
      state = stepBeat(state, quiet, t).state;
    const loud = Array(16).fill(0.9);
    state = stepBeat(state, loud, 10_100).state;
    expect(beatLocked(state)).toBe(false);
  });
});

describe("amplitude", () => {
  it("nods for a quiet song and hops for a loud one", () => {
    expect(amplitude(0.05)).toBe(0);
    expect(amplitude(0.32)).toBeCloseTo(0.49, 1);
    expect(amplitude(0.9)).toBe(1);
  });
});

describe("tempoSpeed", () => {
  it("plays at normal speed at the default tempo", () => {
    expect(tempoSpeed(DEFAULT_BEAT_MS)).toBe(1);
  });
  it("speeds up for a faster song and keeps within a range", () => {
    expect(tempoSpeed(400)).toBe(1.3);
    expect(tempoSpeed(330)).toBe(1.4);
    expect(tempoSpeed(750)).toBe(0.8);
    expect(tempoSpeed(5000)).toBe(0.8);
  });
});
