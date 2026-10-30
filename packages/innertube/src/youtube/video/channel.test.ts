import about from "../../__fixtures__/channel-about.json";
import home from "../../__fixtures__/channel-home.json";
import playlists from "../../__fixtures__/channel-playlists.json";
import search from "../../__fixtures__/channel-search.json";
import popular from "../../__fixtures__/channel-sort-popular.json";
import videos from "../../__fixtures__/channel-videos.json";
import { parseChannel, parseChannelAbout, parseChannelTab } from "./parse";

describe("channel page", () => {
  const page = parseChannel(videos, "UCsBjURrPoezykLs9EqgamOA");

  it("reads the header", () => {
    expect(page.channel.name).toBe("Fireship");
    expect(page.handle).toBe("@Fireship");
    expect(page.videoCountText).toMatch(/videos$/);
    expect(page.channel.subscribersText).toMatch(/subscribers$/);
    expect(page.description).toMatch(/code tutorials/);
    expect(page.about).toBeTruthy();
  });

  it("lists the tabs the channel has, bar Shorts and the rest it doesn't show", () => {
    const kinds = page.tabs?.map((t) => t.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["home", "videos", "live", "playlists"]),
    );
    expect(kinds).not.toContain("shorts");
    expect(page.tabs?.every((t) => t.params)).toBe(true);
    expect(page.search).toBeTruthy();
  });

  it("offers YouTube's own sorts as tokens", () => {
    expect(page.sorts?.map((s) => s.title)).toEqual([
      "Latest",
      "Popular",
      "Oldest",
    ]);
    expect(page.sorts?.[0].selected).toBe(true);
    expect(page.sorts?.every((s) => s.token)).toBe(true);
  });

  it("reads the videos of a sorted reload and keeps it going", () => {
    const sorted = parseChannelTab(popular);
    expect(sorted.items.length).toBeGreaterThan(0);
    expect(sorted.items.every((i) => i.type === "video")).toBe(true);
    expect(sorted.continuation).toBeTruthy();
    expect(sorted.sorts?.find((s) => s.selected)?.title).toBe("Popular");
  });
});

describe("channel tabs", () => {
  it("reads a Playlists tab, with its own sort menu", () => {
    const tab = parseChannelTab(playlists);
    expect(tab.items.length).toBeGreaterThan(0);
    expect(tab.items.every((i) => i.type === "playlist")).toBe(true);
    expect(tab.sorts?.[0].params).toBeTruthy();
  });

  it("reads Home as titled shelves", () => {
    const tab = parseChannelTab(home);
    expect(tab.sections?.length).toBeGreaterThan(0);
    expect(tab.sections?.every((s) => s.title && s.items.length)).toBe(true);
  });

  it("reads the results of a search inside the channel", () => {
    const tab = parseChannelTab(search);
    expect(tab.items.some((i) => i.type === "video")).toBe(true);
  });

  it("reads About, with the real address behind each link", () => {
    const a = parseChannelAbout(about);
    expect(a.joined).toMatch(/^Joined /);
    expect(a.viewsText).toMatch(/views$/);
    expect(a.country).toBe("United States");
    expect(a.links.length).toBeGreaterThan(0);
    expect(
      a.links.every((l) =>
        /^https?:\/\/(?!www\.youtube\.com\/redirect)/.test(l.url),
      ),
    ).toBe(true);
  });
});
