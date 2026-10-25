import { SponsorBlock } from "./sponsorblock";

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
