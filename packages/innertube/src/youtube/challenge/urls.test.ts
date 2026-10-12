import {
  applyN,
  applySig,
  challengesOf,
  nChallengeOf,
  parseSignatureCipher,
} from "./urls";

const media =
  "https://rr1---sn-x.googlevideo.com/videoplayback?expire=1&itag=140&n=AbC-123_x&mime=audio%2Fmp4";
const cipher = (sp?: string) =>
  `s=${encodeURIComponent("Zy=x.wv")}${sp ? `&sp=${sp}` : ""}&url=${encodeURIComponent(media)}`;

describe("signatureCipher", () => {
  it("parses url, s and sp with yt-dlp's default", () => {
    expect(parseSignatureCipher(cipher())).toEqual({
      url: media,
      s: "Zy=x.wv",
      sp: "signature",
    });
    expect(parseSignatureCipher(cipher("sig"))?.sp).toBe("sig");
    expect(parseSignatureCipher("s=abc")).toBeUndefined();
  });

  it("appends the solved signature under sp", () => {
    const solved = { sig: { "Zy=x.wv": "wv.x=yZ" } };
    expect(applySig({ signatureCipher: cipher("sig") }, solved)).toBe(
      `${media}&sig=wv.x=yZ`,
    );
    expect(applySig(cipher(), solved)).toBe(`${media}&signature=wv.x=yZ`);
    expect(applySig({ cipher: cipher() }, { sig: {} })).toBeUndefined();
    expect(applySig({ url: media }, { sig: {} })).toBe(media);
  });
});

describe("n", () => {
  it("replaces only n and keeps the rest byte for byte", () => {
    expect(nChallengeOf(media)).toBe("AbC-123_x");
    expect(applyN(media, { n: { "AbC-123_x": "solved+/=" } })).toBe(
      "https://rr1---sn-x.googlevideo.com/videoplayback?expire=1&itag=140&n=solved%2B%2F%3D&mime=audio%2Fmp4",
    );
    expect(applyN(media, { n: {} })).toBeUndefined();
    const plain = "https://x.googlevideo.com/videoplayback?itag=140";
    expect(applyN(plain, { n: {} })).toBe(plain);
  });

  it("collects every challenge from a format list", () => {
    expect(
      challengesOf([
        { signatureCipher: cipher() },
        { url: media },
        { url: "https://x/videoplayback?itag=18" },
      ]),
    ).toEqual({ n: ["AbC-123_x"], sig: ["Zy=x.wv"] });
  });
});
