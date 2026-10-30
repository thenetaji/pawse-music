import { parseTopTags } from "./lastfm-tags";
import { parseRecording, queryFor } from "./musicbrainz";

jest.mock("../lib/app-version", () => ({ appVersion: "1.0.0" }));
jest.mock("../lib/net", () => ({ appFetch: jest.fn() }));

const NOW = Date.UTC(2026, 9, 1);
const hit = (o: Record<string, unknown>) => ({
  score: 100,
  title: "Wannabe",
  length: 172_000,
  "artist-credit": [{ name: "Spice Girls" }],
  ...o,
});
const want = { title: "Wannabe", artist: "Spice Girls", durationSec: 172 };

describe("parseRecording", () => {
  it("takes the earliest release year of the matching recordings", () => {
    const json = {
      recordings: [
        hit({ "first-release-date": "2018-06-15" }),
        hit({ "first-release-date": "1996-07-08", length: 174_000 }),
        hit({ "first-release-date": "1998-11" }),
      ],
    };
    expect(parseRecording(json, want, NOW)?.year).toBe(1996);
  });

  it("ignores other songs, weak matches and impossible years", () => {
    const json = {
      recordings: [
        hit({ title: "Wannabe Remix", "first-release-date": "1990" }),
        hit({ title: "Stop", "first-release-date": "1991" }),
        hit({ score: 60, "first-release-date": "1992" }),
        hit({ "first-release-date": "1789-01-01" }),
        hit({ "first-release-date": "2005-03-01" }),
      ],
    };
    expect(parseRecording(json, want, NOW)?.year).toBe(2005);
  });

  it("matches a title with a remaster note or brackets", () => {
    const json = { recordings: [hit({ "first-release-date": "1996" })] };
    const remaster = { ...want, title: "Wannabe - 2012 Remaster" };
    expect(parseRecording(json, remaster, NOW)?.year).toBe(1996);
    expect(
      parseRecording(json, { ...want, title: "Wannabe (Official Video)" }, NOW)
        ?.year,
    ).toBe(1996);
  });

  it("falls back to any length when none is close", () => {
    const json = { recordings: [hit({ "first-release-date": "1996" })] };
    expect(parseRecording(json, { ...want, durationSec: 240 }, NOW)?.year).toBe(
      1996,
    );
  });

  it("pools tags by votes and returns nothing without a match", () => {
    const json = {
      recordings: [
        hit({
          "first-release-date": "1996",
          tags: [
            { name: "Pop", count: 3 },
            { name: "dance", count: 1 },
          ],
        }),
        hit({
          "first-release-date": "1997",
          tags: [{ name: "pop", count: 2 }],
        }),
      ],
    };
    expect(parseRecording(json, want, NOW)?.tags).toEqual(["pop", "dance"]);
    expect(parseRecording({ recordings: [] }, want, NOW)).toBeUndefined();
    expect(parseRecording(null, want, NOW)).toBeUndefined();
  });

  it("escapes quotes in the query", () => {
    expect(queryFor({ title: 'A "B"', artist: "C" })).toBe(
      'recording:"A  B" AND artist:"C"',
    );
  });
});

describe("parseTopTags", () => {
  it("keeps tags with weight, lowercase, and tolerates a single tag", () => {
    const tags = [
      { name: "Chill", count: 100 },
      { name: "seen live", count: 8 },
      { name: "90s", count: 45 },
    ];
    expect(parseTopTags({ toptags: { tag: tags } })).toEqual(["chill", "90s"]);
    expect(parseTopTags({ toptags: { tag: tags[0] } })).toEqual(["chill"]);
    expect(parseTopTags({ error: 6 })).toEqual([]);
  });
});
