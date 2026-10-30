import {
  BUDGET_MS,
  hasData,
  IDLE_MS,
  judge,
  kbpsOf,
  MID_SONG_BUDGET_MS,
  NO_BYTES_MS,
  noBytesAfter,
  PREPARE_AFTER_MS,
  progressed,
  RACE_AFTER_MS,
  type Sample,
  saavnNext,
  shouldProbe,
  type Watch,
} from "./stall";

const sample = (over: Partial<Sample> = {}): Sample => ({
  position: 0,
  duration: 0,
  buffered: 0,
  cached: 0,
  ...over,
});
const watch = (over: Partial<Watch> = {}): Watch => ({
  songMs: 0,
  sourceMs: 0,
  idleMs: 0,
  gotData: false,
  midSong: false,
  noBytesMs: NO_BYTES_MS,
  canProbe: true,
  ...over,
});

describe("progressed and hasData", () => {
  test("any new byte shows as movement, a still sample does not", () => {
    expect(progressed(sample(), sample())).toBe(false);
    expect(progressed(sample(), sample({ duration: 200 }))).toBe(true);
    expect(progressed(sample({ cached: 1 }), sample({ cached: 4 }))).toBe(true);
    expect(progressed(sample({ buffered: 5 }), sample({ buffered: 0 }))).toBe(
      true,
    );
    expect(progressed(sample({ position: 3 }), sample({ position: 4 }))).toBe(
      true,
    );
    expect(
      progressed(sample({ duration: 200 }), sample({ duration: 200 })),
    ).toBe(false);
  });

  test("a playlist knows the length before any audio, so only audio counts there", () => {
    expect(hasData(sample({ duration: 200 }), false)).toBe(true);
    expect(hasData(sample({ duration: 200 }), true)).toBe(false);
    expect(hasData(sample({ buffered: 0.4, duration: 200 }), true)).toBe(true);
    expect(hasData(sample(), false)).toBe(false);
  });
});

describe("judge", () => {
  test("a silent source is waited on briefly, then failed over", () => {
    expect(judge(watch({ sourceMs: 2000 }))).toEqual({ kind: "wait" });
    expect(judge(watch({ sourceMs: NO_BYTES_MS }))).toEqual({
      kind: "failover",
      why: "no-bytes",
    });
  });

  test("a refusal fails over at once", () => {
    expect(judge(watch({ sourceMs: 1000, probe: "refused" }))).toEqual({
      kind: "failover",
      why: "refused",
    });
    expect(
      judge(watch({ gotData: true, midSong: true, probe: "refused" })),
    ).toEqual({ kind: "failover", why: "refused" });
  });

  test("the next client answering while this one is silent wins the race", () => {
    const racing = watch({ sourceMs: RACE_AFTER_MS, rivalProbe: "ok" });
    expect(judge(racing)).toEqual({ kind: "failover", why: "no-bytes" });
    expect(judge({ ...racing, probe: "ok" })).toEqual({ kind: "wait" });
    expect(judge({ ...racing, sourceMs: RACE_AFTER_MS - 1 })).toEqual({
      kind: "wait",
    });
  });

  test("a phone that cannot reach the server waits instead of trying other clients", () => {
    expect(
      judge(watch({ sourceMs: NO_BYTES_MS + 3000, probe: "unreachable" })),
    ).toEqual({ kind: "weak" });
    expect(
      judge(
        watch({
          sourceMs: RACE_AFTER_MS,
          probe: "unreachable",
          rivalProbe: "ok",
        }),
      ),
    ).toEqual({ kind: "failover", why: "no-bytes" });
  });

  test("bytes trickling in are never failed over, they are waited on until the budget", () => {
    const slow = watch({ gotData: true, sourceMs: 12_000, songMs: 12_000 });
    expect(judge(slow)).toEqual({ kind: "weak" });
    expect(judge({ ...slow, songMs: BUDGET_MS })).toEqual({ kind: "giveup" });
  });

  test("bytes that stop are probed first; a server that answers is waited on for a while longer", () => {
    const idle = watch({ gotData: true, sourceMs: 20_000, idleMs: IDLE_MS });
    expect(judge(idle)).toEqual({ kind: "weak" });
    expect(judge({ ...idle, idleMs: IDLE_MS * 2 })).toEqual({
      kind: "failover",
      why: "idle",
    });
    expect(
      judge({ ...idle, idleMs: IDLE_MS * 2, probe: "unreachable" }),
    ).toEqual({ kind: "weak" });
    expect(judge({ ...idle, canProbe: false })).toEqual({
      kind: "failover",
      why: "idle",
    });
  });

  test("a song that was playing gets longer to come back than one that never started", () => {
    expect(judge(watch({ songMs: BUDGET_MS, gotData: true }))).toEqual({
      kind: "giveup",
    });
    expect(
      judge(watch({ songMs: BUDGET_MS, gotData: true, midSong: true })).kind,
    ).not.toBe("giveup");
    expect(
      judge(
        watch({ songMs: MID_SONG_BUDGET_MS, gotData: true, midSong: true }),
      ),
    ).toEqual({ kind: "giveup" });
  });
});

describe("noBytesAfter", () => {
  test("a song through the cache fails over fast, a long direct one gets time to read its index", () => {
    expect(noBytesAfter(false, 3 * 3600)).toBe(NO_BYTES_MS);
    expect(noBytesAfter(true, 180)).toBe(NO_BYTES_MS + 3000);
    expect(noBytesAfter(true, 10 * 3600)).toBe(60_000);
  });
});

describe("shouldProbe", () => {
  test("asks once a silent source has had its share, and not again for the same stretch", () => {
    expect(shouldProbe(watch({ sourceMs: PREPARE_AFTER_MS - 1 }))).toBe(false);
    expect(shouldProbe(watch({ sourceMs: PREPARE_AFTER_MS }))).toBe(true);
    expect(shouldProbe(watch({ sourceMs: 9000, probe: "ok" }))).toBe(false);
    expect(shouldProbe(watch({ sourceMs: 9000, canProbe: false }))).toBe(false);
    expect(shouldProbe(watch({ gotData: true, idleMs: IDLE_MS / 2 }))).toBe(
      true,
    );
    expect(shouldProbe(watch({ gotData: true, idleMs: 1000 }))).toBe(false);
  });
});

describe("saavnNext", () => {
  test("after the second silent client there is no room for a third", () => {
    expect(saavnNext(0, false)).toBe(false);
    expect(saavnNext(NO_BYTES_MS, false)).toBe(false);
    expect(saavnNext(2 * NO_BYTES_MS, false)).toBe(true);
    expect(saavnNext(2 * NO_BYTES_MS, true)).toBe(false);
  });
});

describe("kbpsOf", () => {
  test("is the audio taken in per second times the stream's bitrate", () => {
    // 2 s of 128 kbps audio in 1 s is 256 kbps; half a second in 1 s is 64.
    expect(kbpsOf(sample(), sample({ cached: 2 }), 1000, 128_000)).toBe(256);
    expect(kbpsOf(sample(), sample({ buffered: 0.5 }), 1000, 128_000)).toBe(64);
  });

  test("says nothing when nothing arrived or the bitrate is unknown", () => {
    expect(kbpsOf(sample(), sample(), 1000, 128_000)).toBeUndefined();
    expect(kbpsOf(sample(), sample({ cached: 3 }), 1000, 0)).toBeUndefined();
    expect(
      kbpsOf(sample({ cached: 5 }), sample({ cached: 2 }), 1000, 128_000),
    ).toBeUndefined();
  });
});
