import type { Track } from "@pawse/music-core";

import {
  assignGroups,
  eraGroup,
  flattenSections,
  moodGroup,
  namedMood,
  toSections,
} from "./sort-groups";

jest.mock("./clients", () => ({ yt: {}, dropExplicit: (v: unknown) => v }));
jest.mock("./library", () => ({ useLibrary: { getState: jest.fn() } }));
jest.mock("./signals", () => ({ useSignals: { getState: jest.fn() } }));
jest.mock("../lib/use-resource", () => ({ useResource: jest.fn() }));

const NOW = new Date("2026-10-30").getTime();

const track = (id: string, title = id, artist = `a-${id}`): Track => ({
  id,
  source: "youtube",
  title,
  artists: [{ name: artist }],
  thumbnails: [],
});
const many = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => track(`${prefix}${i}`));

describe("namedMood", () => {
  it("reads YouTube Music's mood lists and mood tags", () => {
    expect(namedMood({ lists: ["sad"] })).toBe("sad");
    expect(namedMood({ lists: ["energize"] })).toBe("workout");
    expect(namedMood({ tags: ["romantic", "pop"] })).toBe("romance");
    expect(namedMood({ tags: ["chill", "lo-fi"] })).toBe("chill");
  });

  it("goes with the mood most evidence names, and the more specific on a tie", () => {
    expect(namedMood({ lists: ["chill"], tags: ["relax", "mellow"] })).toBe(
      "chill",
    );
    expect(namedMood({ lists: ["chill", "sad"] })).toBe("sad");
    expect(namedMood({ lists: ["chill"], tags: ["sad"] })).toBe("chill");
  });

  it("has nothing to say about genres alone", () => {
    expect(namedMood({ tags: ["pop", "rock"], lists: ["decade:1990"] })).toBe(
      undefined,
    );
  });
});

describe("moodGroup", () => {
  const t = track("x");
  it("prefers a named mood", () => {
    expect(moodGroup(t, { lists: ["party"], tags: ["classical"] }, NOW)).toBe(
      "party",
    );
  });

  it("falls back to energy when a tag says so", () => {
    expect(moodGroup(t, { tags: ["classical"] }, NOW)).toBe("calm");
    expect(moodGroup(t, { tags: ["pop"] }, NOW)).toBe("steady");
    expect(moodGroup(t, { tags: ["metal"] }, NOW)).toBe("energetic");
  });

  it("leaves a song with no real evidence unlabelled", () => {
    expect(moodGroup(t, {}, NOW)).toBeUndefined();
    expect(moodGroup(track("y", "Lonely Nights"), {}, NOW)).toBeUndefined();
    expect(moodGroup(t, { year: 1995 }, NOW)).toBeUndefined();
  });
});

describe("eraGroup", () => {
  const t = track("x");
  it.each([
    [1985, "old"],
    [1999, "old"],
    [2000, "2000s"],
    [2014, "2010s"],
    [2020, "2020s"],
  ])("puts %s in %s", (year, id) => {
    expect(eraGroup(t, { year }, NOW)).toBe(id);
  });

  it("takes the decade from tags and lists when there is no year", () => {
    expect(eraGroup(t, { tags: ["90s"] }, NOW)).toBe("old");
    expect(eraGroup(t, { lists: ["decade:2010"] }, NOW)).toBe("2010s");
    expect(eraGroup(t, { lists: ["decade:2000"] }, NOW)).toBe("2000s");
  });

  it("prefers the year and leaves a song with none unlabelled", () => {
    expect(eraGroup(t, { year: 2003, lists: ["decade:2010"] }, NOW)).toBe(
      "2000s",
    );
    expect(eraGroup(t, { tags: ["rock"] }, NOW)).toBeUndefined();
  });
});

describe("assignGroups", () => {
  it("sorts languages using the whole library for artists", () => {
    const entry = (id: string, title: string, artist: string) => ({
      track: track(id, title, artist),
      key: id,
      ev: {},
    });
    const out = assignGroups(
      "language",
      [entry("a", "Tum Hi Ho", "Arijit"), entry("b", "तुम", "Other")],
      [entry("c", "तेरी", "Arijit"), entry("d", "यह", "Arijit")],
    );
    expect(out.get("a")).toBe("hi");
    expect(out.get("b")).toBe("hi");
    expect(out.has("c")).toBe(false);
  });
});

describe("toSections", () => {
  const rowsOf = (groups: Record<string, number>) =>
    Object.entries(groups).flatMap(([group, n]) =>
      many(group, n).map((tr) => ({
        track: tr,
        group: group === "none" ? undefined : group,
      })),
    );

  it("orders by size and puts the leftovers last", () => {
    const out = toSections(
      "mood",
      rowsOf({ sad: 3, chill: 5, none: 2, party: 4 }),
    );
    expect(out.map((s) => [s.id, s.label, s.tracks.length])).toEqual([
      ["chill", "Chill", 5],
      ["party", "Party", 4],
      ["sad", "Sad", 3],
      ["other", "Other", 2],
    ]);
    expect(out.map((s) => s.named)).toEqual([true, true, true, false]);
  });

  it("folds groups under three songs into Other with the unlabelled", () => {
    const out = toSections(
      "language",
      rowsOf({ hi: 4, ko: 2, ja: 1, none: 1 }),
    );
    expect(out.map((s) => [s.id, s.tracks.length])).toEqual([
      ["hi", 4],
      ["other", 4],
    ]);
  });

  it("keeps songs with no year apart from small decades", () => {
    const out = toSections("era", rowsOf({ "2010s": 4, "2000s": 2, none: 3 }));
    expect(out.map((s) => [s.id, s.label, s.tracks.length, s.named])).toEqual([
      ["2010s", "2010s", 4, true],
      ["other", "Other", 2, false],
      ["unknown", "Unknown year", 3, false],
    ]);
  });

  it("breaks ties in the usual order and keeps each section in list order", () => {
    const out = toSections("era", rowsOf({ "2020s": 3, old: 3, "2000s": 3 }));
    expect(out.map((s) => s.id)).toEqual(["2020s", "2000s", "old"]);
    expect(out[0].tracks.map((x) => x.id)).toEqual([
      "2020s0",
      "2020s1",
      "2020s2",
    ]);
  });

  it("makes no sections for an empty list", () => {
    expect(toSections("mood", [])).toEqual([]);
  });
});

describe("flattenSections", () => {
  it("lists each header then its songs, with their place in the list", () => {
    const tracks = many("t", 6);
    const sections = toSections("mood", [
      ...[1, 3, 5].map((i) => ({ track: tracks[i], group: "sad" })),
      ...[0, 2, 4].map((i) => ({ track: tracks[i], group: "chill" })),
    ]);
    const rows = flattenSections(sections, tracks);
    expect(rows.map((r) => [r.group.id, r.track?.id, r.i, r.at])).toEqual([
      ["chill", undefined, -1, -1],
      ["chill", "t0", 0, 0],
      ["chill", "t2", 1, 2],
      ["chill", "t4", 2, 4],
      ["sad", undefined, -1, -1],
      ["sad", "t1", 0, 1],
      ["sad", "t3", 1, 3],
      ["sad", "t5", 2, 5],
    ]);
  });
});
