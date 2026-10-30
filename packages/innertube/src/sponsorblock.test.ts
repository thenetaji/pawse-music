import { crowdChapters, musicSkips, SponsorBlock } from "./sponsorblock";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

test("segments come from the hash-prefix list, only for the asked video, earliest first", async () => {
  const fetch = jest.fn((url: string) => {
    expect(url).toContain("/skipSegments/abcd?");
    return json([
      {
        videoID: "other",
        segments: [{ segment: [0, 30], category: "sponsor" }],
      },
      {
        videoID: "vid",
        segments: [
          { segment: [200, 230], category: "music_offtopic" },
          { segment: [0, 12], category: "music_offtopic" },
          { segment: [50, 50.4], category: "music_offtopic" },
        ],
      },
    ]);
  });
  const sb = new SponsorBlock({ fetch, sha256: async () => "abcdef" });
  expect(await sb.segments("vid", ["music_offtopic"])).toEqual([
    { start: 0, end: 12, category: "music_offtopic" },
    { start: 200, end: 230, category: "music_offtopic" },
  ]);
});

test("branding takes a trusted community title and frame, never the original or a voted-down one", async () => {
  const fetch = jest.fn(() =>
    json({
      vid: {
        titles: [
          { title: "Bad", original: false, votes: -2, locked: false },
          { title: "> Honest title", original: false, votes: 1, locked: false },
        ],
        thumbnails: [
          { timestamp: 4.5, original: false, votes: 0, locked: false },
        ],
      },
    }),
  );
  const sb = new SponsorBlock({ fetch, sha256: async () => "ffff" });
  const b = await sb.branding("vid");
  expect(b.title).toBe("Honest title");
  expect(b.thumbnail).toContain("videoID=vid&time=4.5");
});

test("a video SponsorBlock doesn't know gives nothing to skip", async () => {
  const sb = new SponsorBlock({ fetch: () => json("Not Found", 404) });
  expect(await sb.segments("vid", ["sponsor"])).toEqual([]);
  expect(await sb.branding("vid")).toEqual({
    title: undefined,
    thumbnail: undefined,
  });
});

test("the best part is the best-voted moment, ignoring voted-down ones", async () => {
  const fetch = jest.fn((url: string) => {
    expect(url).toContain("actionType=poi");
    return json([
      {
        videoID: "vid",
        segments: [
          { segment: [9, 9], category: "poi_highlight", votes: -1, UUID: "a" },
          {
            segment: [41.5, 41.5],
            category: "poi_highlight",
            votes: 3,
            UUID: "b",
          },
          { segment: [70, 70], category: "poi_highlight", votes: 1, UUID: "c" },
        ],
      },
    ]);
  });
  const sb = new SponsorBlock({ fetch, sha256: async () => "abcdef" });
  expect(await sb.highlight("vid")).toEqual({ at: 41.5, uuid: "b" });
});

test("community chapters drop overlaps and a lone stray chapter", () => {
  const seg = (a: number, b: number, d: string, votes = 0) => ({
    segment: [a, b] as [number, number],
    category: "chapter",
    description: d,
    votes,
  });
  expect(
    crowdChapters([
      seg(100, 200, "Middle"),
      seg(0, 100, "Intro"),
      seg(150, 260, "Overlaps and loses", -1),
      seg(200, 300, "End"),
      seg(300, 310, "  "),
    ]),
  ).toEqual([
    { startSec: 0, title: "Intro" },
    { startSec: 100, title: "Middle" },
    { startSec: 200, title: "End" },
  ]);
  expect(crowdChapters([seg(10, 20, "Alone")])).toEqual([]);
});

describe("musicSkips", () => {
  const seg = (start: number, end: number, extra = {}) => ({
    start,
    end,
    category: "music_offtopic",
    ...extra,
  });

  it("skips intros and outros", () => {
    expect(musicSkips([seg(0, 20), seg(200, 240)], 240)).toHaveLength(2);
  });

  it("leaves a mid-song part unless the community is sure of it", () => {
    expect(musicSkips([seg(90, 120)], 240)).toEqual([]);
    expect(musicSkips([seg(90, 120, { votes: 3 })], 240)).toHaveLength(1);
    expect(musicSkips([seg(90, 120, { locked: true })], 240)).toHaveLength(1);
  });
});
