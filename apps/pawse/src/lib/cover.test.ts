import type { Thumbnail } from "@pawse/music-core";

import { artworkSources, coverSources, listCoverPx } from "./cover";

const thumb = (url: string, width = 544): Thumbnail => ({
  url,
  width,
  height: width,
});
const lh3 = "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj";

describe("coverSources", () => {
  it("asks YouTube Music covers for 1200 px and keeps the original behind it", () => {
    expect(coverSources([thumb(lh3)])).toEqual([
      "https://lh3.googleusercontent.com/abc=w1200-h1200-l90-rj",
      lh3,
    ]);
  });

  it("tries a video's HD stills before its own frame", () => {
    const still = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    expect(coverSources([thumb(still, 480)])).toEqual([
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg",
      still,
    ]);
    expect(artworkSources("https://example.com/a.jpg")).toEqual([
      "https://example.com/a.jpg",
    ]);
  });

  it("settles for 544 px on data saver and has nothing for no art", () => {
    expect(coverSources([thumb(lh3)], 1200, true)).toEqual([
      "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj",
    ]);
    expect(coverSources([])).toEqual([]);
  });
});

describe("listCoverPx", () => {
  it("rounds list covers to a few shared sizes", () => {
    expect(listCoverPx(48)).toBe(300);
    expect(listCoverPx(96)).toBe(300);
    expect(listCoverPx(160)).toBe(544);
    expect(listCoverPx(48, true)).toBe(150);
  });
});
