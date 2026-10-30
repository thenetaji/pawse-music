import { coefficients, peakBoostDb, responseDb } from "./biquad";
import {
  decodeIndex,
  encodeIndex,
  parseIndex,
  parseParametricEq,
  profileUrl,
  searchIndex,
} from "./autoeq";
import { chainFor, DEFAULT_EQ } from "./eq";

describe("biquad", () => {
  it("peaks at the centre by the set gain", () => {
    const f = { kind: "peak" as const, freq: 1000, gain: 6, q: 1 };
    expect(responseDb([f], 1000)).toBeCloseTo(6, 1);
    expect(responseDb([f], 50)).toBeCloseTo(0, 0);
  });
  it("shelves reach their gain away from the corner", () => {
    const low = { kind: "lowshelf" as const, freq: 200, gain: -4, q: 0.7 };
    const high = { kind: "highshelf" as const, freq: 5000, gain: 5, q: 0.7 };
    expect(responseDb([low], 30)).toBeCloseTo(-4, 0);
    expect(responseDb([high], 18000)).toBeCloseTo(5, 0);
  });
  it("a zero-gain filter does nothing", () => {
    const c = coefficients({ kind: "peak", freq: 500, gain: 0, q: 1 }, 48000);
    expect(c.b0).toBeCloseTo(1);
    expect(c.b1).toBeCloseTo(c.a1);
    expect(c.b2).toBeCloseTo(c.a2);
  });
  it("finds the largest boost", () => {
    const f = { kind: "peak" as const, freq: 2000, gain: 4, q: 1.4 };
    expect(peakBoostDb([f])).toBeCloseTo(4, 0);
    expect(peakBoostDb([{ ...f, gain: -4 }])).toBe(0);
  });
});

describe("eq chain", () => {
  it("is empty while off", () => {
    expect(chainFor({ ...DEFAULT_EQ, on: false, preset: "bass" })).toEqual({
      preamp: 0,
      filters: [],
    });
  });
  it("cuts the preamp by a preset's boost", () => {
    const c = chainFor({ ...DEFAULT_EQ, on: true, preset: "bass" });
    expect(c.filters.length).toBeGreaterThan(0);
    expect(c.preamp).toBeLessThan(-4);
  });
  it("uses a headphone profile's own preamp plus the user's", () => {
    const profile = {
      name: "X",
      source: "s",
      preamp: -6,
      filters: [{ kind: "peak" as const, freq: 100, gain: 3, q: 1 }],
    };
    const c = chainFor({
      ...DEFAULT_EQ,
      on: true,
      preset: "headphones",
      preamp: 2,
      headphone: profile,
    });
    expect(c).toEqual({ preamp: -4, filters: profile.filters });
  });
  it("plays flat when no headphone is chosen", () => {
    expect(
      chainFor({ ...DEFAULT_EQ, on: true, preset: "headphones" }).filters,
    ).toEqual([]);
  });
});

describe("AutoEq", () => {
  const index = [
    "# Index",
    "",
    "- [Sennheiser HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600) by oratory1990",
    "- [Sennheiser HD 600](./crinacle/GRAS%2043AG-7%20over-ear/Sennheiser%20HD%20600) by crinacle on GRAS 43AG-7",
    "- [1MORE Aero (ANC On)](./HypetheSonics/GRAS%20RA0045%20in-ear/1MORE%20Aero%20(ANC%20On)) by HypetheSonics on GRAS RA0045",
  ].join("\n");

  it("reads the index, keeping parentheses in names and paths", () => {
    const list = parseIndex(index);
    expect(list).toHaveLength(3);
    expect(list[2]).toEqual({
      name: "1MORE Aero (ANC On)",
      path: "HypetheSonics/GRAS%20RA0045%20in-ear/1MORE%20Aero%20(ANC%20On)",
      source: "HypetheSonics on GRAS RA0045",
    });
  });
  it("searches by every word and ranks oratory1990 first", () => {
    const list = parseIndex(index);
    const hits = searchIndex(list, "hd 600");
    expect(hits.map((h) => h.source)).toEqual([
      "oratory1990",
      "crinacle on GRAS 43AG-7",
    ]);
    expect(searchIndex(list, "aero anc")).toHaveLength(1);
    expect(searchIndex(list, "")).toEqual([]);
  });
  it("builds the ParametricEQ file url", () => {
    expect(profileUrl(parseIndex(index)[0])).toBe(
      "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/over-ear/Sennheiser%20HD%20600/Sennheiser%20HD%20600%20ParametricEQ.txt",
    );
  });
  it("keeps the index through the cache format", () => {
    const list = parseIndex(index);
    expect(decodeIndex(encodeIndex(list))).toEqual(list);
  });
  it("parses a ParametricEQ file", () => {
    const text = [
      "Preamp: -6.3 dB",
      "Filter 1: ON LSC Fc 105 Hz Gain 6.5 dB Q 0.70",
      "Filter 2: ON PK Fc 125 Hz Gain -2.7 dB Q 0.55",
      "Filter 3: OFF PK Fc 8445 Hz Gain 3.3 dB Q 1.61",
      "Filter 4: ON HSC Fc 10000 Hz Gain -3.1 dB Q 0.70",
      "Filter 5: ON LP Fc 18000 Hz",
    ].join("\n");
    expect(parseParametricEq(text)).toEqual({
      preamp: -6.3,
      filters: [
        { kind: "lowshelf", freq: 105, gain: 6.5, q: 0.7 },
        { kind: "peak", freq: 125, gain: -2.7, q: 0.55 },
        { kind: "highshelf", freq: 10000, gain: -3.1, q: 0.7 },
      ],
    });
    expect(parseParametricEq("404: Not Found")).toBeNull();
  });
});
