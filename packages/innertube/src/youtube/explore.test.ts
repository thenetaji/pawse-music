import charts from "../__fixtures__/charts-in.json";
import chartsGlobal from "../__fixtures__/charts-global.json";
import explore from "../__fixtures__/explore.json";
import moodPage from "../__fixtures__/mood-page.json";
import moods from "../__fixtures__/moods-and-genres.json";
import newReleases from "../__fixtures__/new-releases.json";
import {
  argbToHex,
  moodParams,
  parseCharts,
  parseExplore,
  parseMoodPage,
  parseMoodsAndGenres,
  parseNewReleases,
} from "./explore";

// Real WEB_REMIX responses captured 2026-10-08 (gl=IN, signed out), trimmed.
describe("explore", () => {
  it("reads shelves and the mood tiles", () => {
    const feed = parseExplore(explore);
    expect(feed.shelves.map((s) => s.title)).toEqual([
      "New albums & singles",
      "Trending",
      "New music videos",
    ]);
    expect(feed.shelves[0].items[0].type).toBe("album");
    expect(feed.shelves[1].items[0].type).toBe("track");
    expect(feed.moods.length).toBeGreaterThan(10);
    expect(feed.moods[0].params).toMatch(
      /^FEmusic_moods_and_genres_category\|/,
    );
  });
});

describe("moods and genres", () => {
  it("reads a flat list of coloured tiles with their section", () => {
    const tiles = parseMoodsAndGenres(moods);
    expect(tiles.length).toBeGreaterThan(10);
    expect(new Set(tiles.map((t) => t.section))).toEqual(
      new Set(["Moods & moments", "Genres"]),
    );
    for (const t of tiles) {
      expect(t.title).not.toBe("");
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("converts ARGB ints and accepts raw or encoded params", () => {
    expect(argbToHex(4283058762)).toBe("#4a4a4a");
    expect(argbToHex(undefined)).toBeUndefined();
    expect(moodParams("FEmusic_moods_and_genres_category|abc")).toBe("abc");
    expect(moodParams("abc")).toBe("abc");
  });

  it("reads a mood page as playlist shelves", () => {
    const shelves = parseMoodPage(moodPage);
    expect(shelves.length).toBeGreaterThan(1);
    expect(shelves.some((s) => s.items[0]?.type === "playlist")).toBe(true);
  });
});

describe("charts", () => {
  it("reads the country list and artist/playlist shelves", () => {
    const page = parseCharts(charts, "IN");
    expect(page.country).toEqual({ code: "IN", title: "India" });
    expect(page.countries).toContainEqual({ code: "IN", title: "India" });
    expect(page.countries).toContainEqual({ code: "ZZ", title: "Global" });
    expect(page.countries.length).toBeGreaterThan(30);
    const kinds = page.shelves.flatMap((s) => s.items.map((i) => i.type));
    expect(kinds).toContain("artist");
    expect(kinds).toContain("playlist");
  });

  it("selects Global for ZZ", () => {
    expect(parseCharts(chartsGlobal, "ZZ").country).toEqual({
      code: "ZZ",
      title: "Global",
    });
  });
});

describe("new releases", () => {
  it("reads the grid as one albums shelf", () => {
    const shelves = parseNewReleases(newReleases);
    expect(shelves[0].title).toBe("New releases");
    const albums = shelves[0].items;
    expect(albums.length).toBeGreaterThan(5);
    expect(
      albums.every((a) => a.type === "album" && a.id.startsWith("MPREb_")),
    ).toBe(true);
  });
});
