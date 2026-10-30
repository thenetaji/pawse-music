import { StreamError } from "@pawse/music-core";

import blindingLights from "./__fixtures__/saavn-search-blinding-lights.json";
import tumHiHo from "./__fixtures__/saavn-search-tum-hi-ho.json";
import { createResolver } from "./resolver";
import {
  JioSaavn,
  decryptMediaUrl,
  matchSong,
  matchSongStrict,
  normalizeTitle,
  type SaavnSong,
  toSaavnSong,
} from "./saavn";
import { desEcb } from "./util/des";

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) =>
  Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const songs = (j: { results: unknown[] }) =>
  j.results.map(toSaavnSong).filter((s) => !!s);

describe("DES-ECB", () => {
  it("matches the FIPS 46 worked example both ways", () => {
    const c = desEcb(
      bytes("0123456789abcdef"),
      bytes("133457799bbcdff1"),
      false,
    );
    expect(hex(c)).toBe("85e813540f0ab405");
    expect(hex(desEcb(c, bytes("133457799bbcdff1"), true))).toBe(
      "0123456789abcdef",
    );
  });

  it("decrypts a real encrypted_media_url", () => {
    const url = decryptMediaUrl(
      tumHiHo.results[0].more_info.encrypted_media_url,
    );
    expect(url).toMatch(
      /^https:\/\/aac\.saavncdn\.com\/\d+\/[0-9a-f]+_96\.mp4$/,
    );
  });
});

describe("matching", () => {
  it('normalises "(From …)", feat., remaster tags, entities and diacritics', () => {
    expect(normalizeTitle("Tum Hi Ho (From &quot;Aashiqui 2&quot;)")).toBe(
      "tum hi ho",
    );
    expect(normalizeTitle("Café Del Mar - Remastered 2011")).toBe(
      "cafe del mar",
    );
    expect(normalizeTitle("Peaches (feat. Daniel Caesar)")).toBe("peaches");
    expect(normalizeTitle("Halo [2019 Remaster]")).toBe("halo");
    expect(normalizeTitle("Blinding Lights (Remix)")).toBe(
      "blinding lights remix",
    );
  });

  it("matches title, primary artist and duration and upgrades to 320 kbps", () => {
    const hit = matchSong(
      {
        title: "Tum Hi Ho",
        artists: [{ name: "Arijit Singh" }],
        durationSec: 260,
      },
      songs(tumHiHo),
    );
    expect(hit?.title).toBe("Tum Hi Ho");
    expect(hit?.mediaUrl).toMatch(/_320\.mp4$/);
  });

  it("rejects a wrong duration or a karaoke/cover artist", () => {
    expect(
      matchSong(
        {
          title: "Tum Hi Ho",
          artists: [{ name: "Arijit Singh" }],
          durationSec: 250,
        },
        songs(tumHiHo),
      ),
    ).toBeUndefined();
    expect(
      matchSong(
        {
          title: "Blinding Lights",
          artists: [{ name: "The Weeknd" }],
          durationSec: 200,
        },
        songs(blindingLights),
      ),
    ).toBeUndefined();
  });
});

describe("strict matching", () => {
  const listing = (o: Partial<SaavnSong> = {}): SaavnSong => ({
    id: "1",
    title: "Tum Hi Ho",
    artists: ["Arijit Singh", "Mithoon"],
    primaryArtists: ["Arijit Singh", "Mithoon"],
    album: "Aashiqui 2",
    durationSec: 262,
    mediaUrl: "https://aac.saavncdn.com/1/a_320.mp4",
    is320: true,
    ...o,
  });
  const yt = {
    title: "Tum Hi Ho",
    artists: [{ name: "Arijit Singh" }],
    album: { id: "a", title: "Aashiqui 2" },
    durationSec: 262,
  };
  const accepts = (song: Partial<SaavnSong>, track: object = {}) =>
    matchSongStrict({ ...yt, ...track }, [listing(song)]) !== undefined;

  it("takes the same recording whatever its decorations", () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ title: "Tum Hi Ho (From &quot;Aashiqui 2&quot;)" })).toBe(
      true,
    );
    expect(accepts({}, { title: "Tum Hi Ho (feat. Mithoon)" })).toBe(true);
    expect(accepts({ title: "Tum Hi Ho - Remastered 2020" })).toBe(true);
    expect(accepts({ primaryArtists: ["arijit singh"] })).toBe(true);
  });

  it("picks the listing closest in length", () => {
    const hit = matchSongStrict({ ...yt, durationSec: 261 }, songs(tumHiHo));
    expect(hit?.durationSec).toBe(261);
    expect(matchSongStrict(yt, songs(tumHiHo))?.durationSec).toBe(262);
  });

  it("allows 2 s of drift and no more, and needs both lengths", () => {
    expect(accepts({ durationSec: 264 })).toBe(true);
    expect(accepts({ durationSec: 265 })).toBe(false);
    expect(accepts({ durationSec: undefined })).toBe(false);
    expect(accepts({}, { durationSec: undefined })).toBe(false);
  });

  it("needs the same primary artist, not a featured credit or a namesake song", () => {
    expect(accepts({ primaryArtists: ["Shahid Mallya"] })).toBe(false);
    expect(
      accepts({
        artists: ["Karaoke Hits", "Arijit Singh"],
        primaryArtists: ["Karaoke Hits"],
      }),
    ).toBe(false);
    const namesake = matchSongStrict(
      { ...yt, artists: [{ name: "Shahid Mallya" }] },
      songs(tumHiHo),
    );
    expect(namesake?.primaryArtists).toContain("Shahid Mallya");
  });

  it("refuses other versions unless the YouTube track is one too", () => {
    expect(accepts({ title: "Tum Hi Ho (Lofi)" })).toBe(false);
    expect(accepts({ title: "Tum Hi Ho (Live)" })).toBe(false);
    expect(accepts({ title: "Tum Hi Ho (Slowed + Reverb)" })).toBe(false);
    expect(accepts({ title: "Tum Hi Ho (Cover)" })).toBe(false);
    expect(accepts({ album: "Bollywood Remix Hits" })).toBe(false);
    expect(accepts({ title: "Tum Hi Ho (Sped Up)" })).toBe(false);
    expect(
      accepts({ title: "Tum Hi Ho - Lofi" }, { title: "Tum Hi Ho (Lofi)" }),
    ).toBe(true);
    expect(accepts({}, { title: "Tum Hi Ho (Live)" })).toBe(false);
  });

  it("needs 320 kbps and an agreeing explicit flag", () => {
    expect(accepts({ is320: false })).toBe(false);
    expect(accepts({ mediaUrl: undefined })).toBe(false);
    expect(accepts({ explicit: true })).toBe(false);
    expect(accepts({ explicit: true }, { explicit: true })).toBe(true);
    expect(accepts({ explicit: false }, { explicit: true })).toBe(false);
  });

  it("is stricter than the fallback match", () => {
    const loose = { ...yt, durationSec: 259 };
    expect(matchSong(loose, [listing()])).toBeDefined();
    expect(matchSongStrict(loose, [listing()])).toBeUndefined();
  });
});

describe("resolve", () => {
  const fetchOf = (body: unknown) =>
    jest.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => body }) as Response,
    );

  it("returns a saavn stream or no_audio", async () => {
    const saavn = new JioSaavn({ fetch: fetchOf(tumHiHo) });
    const s = await saavn.resolve({
      id: "v",
      source: "youtube",
      title: "Tum Hi Ho",
      artists: [{ name: "Arijit Singh" }],
      durationSec: 262,
    });
    expect(s).toMatchObject({
      via: "saavn",
      mimeType: "audio/mp4",
      bitrate: 320_000,
    });
    const miss = new JioSaavn({ fetch: fetchOf(blindingLights) });
    await expect(
      miss.resolve({
        id: "v",
        source: "youtube",
        title: "Blinding Lights",
        artists: [{ name: "The Weeknd" }],
        durationSec: 200,
      }),
    ).rejects.toMatchObject({
      code: "no_audio",
    });
  });
});

describe("createResolver", () => {
  const ok = (via: string) => ({
    resolve: jest.fn(async () => ({
      url: via,
      mimeType: "audio/mp4",
      bitrate: 1,
      expiresAt: 0,
      via,
    })),
  });
  const fail = (code: StreamError["code"]) => ({
    resolve: jest.fn(async () => Promise.reject(new StreamError(code, code))),
  });
  const song = {
    id: "v",
    source: "youtube" as const,
    title: "t",
    artists: [],
    kind: "song" as const,
  };

  it("prefers YouTube, then falls back to Saavn", async () => {
    expect(
      (
        await createResolver({ youtube: ok("yt"), saavn: ok("sv") }).resolve(
          song,
        )
      ).via,
    ).toBe("yt");
    expect(
      (
        await createResolver({
          youtube: fail("blocked"),
          saavn: ok("sv"),
        }).resolve(song)
      ).via,
    ).toBe("sv");
  });

  it("lets a call choose whether Saavn goes first", async () => {
    const first = createResolver({ youtube: ok("yt"), saavn: ok("sv") });
    expect((await first.resolve(song, { saavn: "first" })).via).toBe("sv");
    const never = createResolver({
      youtube: ok("yt"),
      saavn: ok("sv"),
      preferSaavn: true,
    });
    expect((await never.resolve(song, { saavn: "never" })).via).toBe("yt");
  });

  it("can skip YouTube for Saavn's loose fallback, and reports Saavn's own failure", async () => {
    const youtube = ok("yt");
    const r = createResolver({ youtube, saavn: ok("sv") });
    expect((await r.resolve(song, { skipYouTube: true })).via).toBe("sv");
    expect(youtube.resolve).not.toHaveBeenCalled();
    const none = createResolver({ youtube, saavn: fail("no_audio") });
    await expect(none.resolve(song, { skipYouTube: true })).rejects.toThrow(
      "no_audio",
    );
  });

  it("tries Saavn first for songs when preferred, and only for songs", async () => {
    const r = createResolver({
      youtube: ok("yt"),
      saavn: ok("sv"),
      preferSaavn: true,
    });
    expect((await r.resolve(song)).via).toBe("sv");
    expect((await r.resolve({ ...song, kind: "video" })).via).toBe("yt");
    expect(
      (
        await createResolver({
          youtube: ok("yt"),
          saavn: fail("no_audio"),
          preferSaavn: true,
        }).resolve(song)
      ).via,
    ).toBe("yt");
  });

  it("asks the preferred Saavn for a strict match, and only at high quality", async () => {
    const saavn = ok("sv");
    const r = (quality: "high" | "normal" | "saver") =>
      createResolver({
        youtube: ok("yt"),
        saavn,
        preferSaavn: true,
        quality: () => quality,
      });
    expect((await r("high").resolve(song)).via).toBe("sv");
    expect(saavn.resolve).toHaveBeenCalledWith(
      song,
      expect.objectContaining({ strict: true }),
    );
    expect((await r("normal").resolve(song)).via).toBe("yt");
    expect((await r("saver").resolve(song)).via).toBe("yt");
  });

  it("keeps the loose Saavn match for the fallback after YouTube fails", async () => {
    const saavn = ok("sv");
    await createResolver({
      youtube: fail("blocked"),
      saavn,
      preferSaavn: true,
    }).resolve({ ...song, kind: "video" });
    expect(saavn.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ strict: true }),
    );
  });

  it("sends saavn tracks to Saavn and surfaces YouTube's error when both fail", async () => {
    const youtube = ok("yt");
    expect(
      (
        await createResolver({ youtube, saavn: ok("sv") }).resolve({
          ...song,
          source: "saavn",
        })
      ).via,
    ).toBe("sv");
    expect(youtube.resolve).not.toHaveBeenCalled();
    await expect(
      createResolver({
        youtube: fail("age_restricted"),
        saavn: fail("no_audio"),
      }).resolve(song),
    ).rejects.toMatchObject({ code: "age_restricted" });
  });

  it("plays a downloaded file first unless remoteOnly, and passes the quality", async () => {
    const youtube = ok("yt");
    const file = {
      url: "file:///doc/v.m4a",
      mimeType: "audio/mp4",
      bitrate: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
      via: "local",
    };
    const r = createResolver({
      youtube,
      local: (id) => (id === "v" ? file : undefined),
      quality: () => "saver",
    });
    expect((await r.resolve(song)).via).toBe("local");
    expect(youtube.resolve).not.toHaveBeenCalled();
    expect((await r.resolve(song, { remoteOnly: true })).via).toBe("yt");
    expect(youtube.resolve).toHaveBeenLastCalledWith(song, {
      remoteOnly: true,
      quality: "saver",
    });
    await r.resolve({ ...song, id: "w" }, { quality: "high" });
    expect(youtube.resolve).toHaveBeenLastCalledWith(
      { ...song, id: "w" },
      { quality: "high" },
    );
  });
});
