import artist from "../__fixtures__/artist.json";
import nextRadio from "../__fixtures__/next-radio.json";
import related from "../__fixtures__/related.json";
import { YouTubeMusic } from "./music";
import { parseArtist, parseRelated, similarArtists } from "./parse";

// related.json: the Related tab of "Blinding Lights" (MPTR browse), captured 2026-10-08, trimmed.
const WEEKND = { id: "UClYV6hHlupm_S_ObS1W-DYw", name: "The Weeknd" };

const reply = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe("related", () => {
  it("reads songs, playlists, similar artists and the artist's albums", () => {
    const shelves = parseRelated(related);
    expect(shelves.map((s) => s.title)).toEqual([
      "You might also like",
      "Recommended playlists",
      "Other performances",
      "Similar artists",
      "The Weeknd",
    ]);
    expect(shelves[0].items[0]).toMatchObject({
      type: "track",
      id: "J7p4bzqLvCw",
      artists: [WEEKND],
    });
    expect(shelves[1].items[0].type).toBe("playlist");
    expect(shelves[4].subtitle).toBe("MORE FROM");
    expect(shelves[4].items[0]).toMatchObject({
      type: "album",
      artists: [WEEKND],
    });
    expect(similarArtists(shelves)[0]).toMatchObject({ name: "Khalid" });
  });

  it("reads 'Fans might also like' from an artist page", () => {
    const fans = similarArtists(parseArtist(artist, WEEKND.id).shelves);
    expect(fans.length).toBeGreaterThan(0);
    expect(fans[0].id).toMatch(/^UC/);
  });

  it("fetches next for the MPTR id, then browses it", async () => {
    const bodies: any[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (!url.includes("/youtubei/v1/")) return reply({}, 404);
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return reply(url.includes("/next") ? nextRadio : related);
    });
    const yt = new YouTubeMusic({ fetch, clientsConfigUrl: null });
    const shelves = await yt.related("J7p4bzqLvCw");
    expect(bodies[0]).toMatchObject({
      videoId: "J7p4bzqLvCw",
      playlistId: "RDAMVMJ7p4bzqLvCw",
    });
    expect(bodies[1].browseId).toBe("MPTRt_4U7yfKKFZLv-1");
    expect(shelves[0].title).toBe("You might also like");
    // An MPTR id skips the next call.
    await yt.related("MPTRt_4U7yfKKFZLv-1");
    expect(bodies).toHaveLength(3);
  });

  it("answers [] when the tab or its shelves are missing", async () => {
    expect(parseRelated({})).toEqual([]);
    expect(parseRelated({ contents: { sectionListRenderer: {} } })).toEqual([]);
    const fetch = jest.fn(async () => reply({ contents: {} }));
    const yt = new YouTubeMusic({ fetch, clientsConfigUrl: null });
    await expect(yt.related("J7p4bzqLvCw")).resolves.toEqual([]);
    // No MPTR tab in the next reply, so nothing is browsed.
    const urls = fetch.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.some((u) => u.includes("/browse"))).toBe(false);
  });
});
