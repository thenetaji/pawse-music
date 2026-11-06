import { parseSharedSong, pickMatch } from "./shared-song";

const LINK =
  "https://www.shazam.com/track/648378119/panche-ke-nache-aiha?co=IN&referrer=shazam-module&offsetInMilliseconds=171637&timeSkew=2.1505356E-4&trackLength=220286&startDate=2026-11-06T08:53:39.268Z#%7B%22title%22:%22Panche%20Ke%20Nache%20Aiha%22,%22artist%22:%22Pawan%20Singh%20&%20Shilpi%20Raj%22%7D";
const song = parseSharedSong(LINK)!;
const track = (title: string, artist: string, durationSec?: number) => ({
  title,
  artists: [{ name: artist }],
  durationSec,
});

describe("parseSharedSong", () => {
  it("reads the title, artist and length from a real share link", () => {
    expect(song).toEqual({
      title: "Panche Ke Nache Aiha",
      artist: "Pawan Singh & Shilpi Raj",
      lengthMs: 220286,
      query: "Panche Ke Nache Aiha Pawan Singh & Shilpi Raj",
    });
  });

  it("finds the link inside a sentence", () => {
    expect(parseSharedSong(`Listen to this: ${LINK} it's great`)?.title).toBe(
      "Panche Ke Nache Aiha",
    );
  });

  it("falls back to the title in the path when the names are missing", () => {
    expect(
      parseSharedSong(
        "https://www.shazam.com/track/5933917/stairway-to-heaven",
      ),
    ).toEqual({ title: "stairway to heaven", query: "stairway to heaven" });
  });

  it("survives a broken fragment", () => {
    expect(
      parseSharedSong("https://www.shazam.com/track/1/some-song#%7Bbroken")
        ?.title,
    ).toBe("some song");
  });

  it("ignores anything that names no song", () => {
    expect(
      parseSharedSong("https://www.shazam.com/track/5933917"),
    ).toBeUndefined();
    expect(parseSharedSong("https://youtu.be/abc")).toBeUndefined();
    expect(parseSharedSong("hello")).toBeUndefined();
  });
});

describe("pickMatch", () => {
  it("prefers the artist's copy at the right length over a longer upload", () => {
    const right = track("Panche Ke Nache Aiha", "Pawan Singh", 220);
    const live = track("Panche Ke Nache Aiha (Live)", "Pawan Singh", 480);
    expect(pickMatch([live, right], song)).toBe(right);
  });

  it("accepts a video whose channel is the label when its title names the singer", () => {
    const video = track(
      "Panche Ke Nache Aiha | Pawan Singh, Shilpi Raj | Official Video",
      "Wave Music",
      235,
    );
    expect(pickMatch([video], song)).toBe(video);
  });

  it("refuses a same-named song by someone else at another length", () => {
    expect(
      pickMatch([track("Panche Ke Nache Aiha", "Cover Band", 150)], song),
    ).toBeUndefined();
  });

  it("refuses a different song by the same artist", () => {
    expect(
      pickMatch([track("Lollipop Lagelu", "Pawan Singh", 220)], song),
    ).toBeUndefined();
  });

  it("takes an exact title when the link gave nothing else to check", () => {
    const only = parseSharedSong(
      "https://www.shazam.com/track/5933917/stairway-to-heaven",
    )!;
    const right = track("Stairway to Heaven", "Led Zeppelin");
    expect(pickMatch([right], only)).toBe(right);
  });
});
