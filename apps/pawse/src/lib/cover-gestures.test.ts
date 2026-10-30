import {
  CHAIN_MS,
  DOUBLE_MS,
  pullCloses,
  registerTap,
  seekTarget,
  type TapChain,
  tapZone,
  volumeAt,
} from "./cover-gestures";

describe("tapZone", () => {
  it("splits the cover in thirds", () => {
    expect(tapZone(10, 300)).toBe(-1);
    expect(tapZone(99, 300)).toBe(-1);
    expect(tapZone(150, 300)).toBe(0);
    expect(tapZone(201, 300)).toBe(1);
    expect(tapZone(299, 300)).toBe(1);
  });

  it("treats an unmeasured cover as the middle", () => {
    expect(tapZone(40, 0)).toBe(0);
  });
});

describe("volumeAt", () => {
  it("is louder going up and quieter going down", () => {
    expect(volumeAt(0.5, -60, 300)).toBeCloseTo(0.7);
    expect(volumeAt(0.5, 60, 300)).toBeCloseTo(0.3);
  });

  it("goes from silent to full over the travel", () => {
    expect(volumeAt(0, -300, 300)).toBe(1);
    expect(volumeAt(1, 300, 300)).toBe(0);
  });

  it("stays between 0 and 1", () => {
    expect(volumeAt(0.9, -900, 300)).toBe(1);
    expect(volumeAt(0.1, 900, 300)).toBe(0);
  });

  it("keeps the volume when there is no travel to measure", () => {
    expect(volumeAt(0.4, -50, 0)).toBe(0.4);
  });
});

describe("seekTarget", () => {
  it("moves 10 s either way", () => {
    expect(seekTarget(60, 1, 200)).toBe(70);
    expect(seekTarget(60, -1, 200)).toBe(50);
  });

  it("stays inside the song", () => {
    expect(seekTarget(4, -1, 200)).toBe(0);
    expect(seekTarget(195, 1, 200)).toBe(200);
  });

  it("only clamps the start while the length is unknown", () => {
    expect(seekTarget(195, 1, 0)).toBe(205);
  });
});

describe("registerTap", () => {
  it("is single when nothing came before", () => {
    expect(registerTap(undefined, 1, 1000).kind).toBe("single");
  });

  it("is a double tap in the same third within the window", () => {
    const first = registerTap(undefined, 1, 1000).chain;
    const second = registerTap(first, 1, 1000 + DOUBLE_MS - 1);
    expect(second.kind).toBe("double");
    expect(second.chain.chained).toBe(true);
  });

  it("is single again when the second tap is late or in another third", () => {
    const first = registerTap(undefined, -1, 1000).chain;
    expect(registerTap(first, -1, 1000 + DOUBLE_MS).kind).toBe("single");
    expect(registerTap(first, 1, 1100).kind).toBe("single");
  });

  it("adds up taps after a double tap", () => {
    let chain: TapChain | undefined;
    const kinds = [0, 150, 300, 500, 900].map((t) => {
      const r = registerTap(chain, 1, 1000 + t);
      chain = r.chain;
      return r.kind;
    });
    expect(kinds).toEqual(["single", "double", "again", "again", "again"]);
  });

  it("ends the chain after a pause", () => {
    const chained = registerTap(
      registerTap(undefined, 1, 0).chain,
      1,
      100,
    ).chain;
    expect(registerTap(chained, 1, 100 + CHAIN_MS).kind).toBe("single");
  });
});

describe("pullCloses", () => {
  it("closes on a long pull or a quick flick down", () => {
    expect(pullCloses(120, 0)).toBe(true);
    expect(pullCloses(40, 900)).toBe(true);
  });

  it("ignores a short slow pull and a flick that barely moved", () => {
    expect(pullCloses(40, 100)).toBe(false);
    expect(pullCloses(10, 2000)).toBe(false);
  });
});
