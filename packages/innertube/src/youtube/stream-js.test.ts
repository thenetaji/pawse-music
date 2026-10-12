import { resetPlayerCache } from "./challenge/player";
import {
  DEFAULT_STREAM_CLIENTS_V2,
  parseClientsConfig,
  type StreamClient,
} from "./clients";
import { YouTubeMusic } from "./music";
import type { JsSandbox, PoTokenProvider } from "./sandbox";
import { pickAudioFormat } from "./stream";

// The EJS protocol has its own tests; here the solver just reverses signatures and prefixes n.
jest.mock("./challenge/solver", () => ({
  solveChallenges: jest.fn(async (_s: unknown, _p: unknown, c: any) => ({
    n: Object.fromEntries(c.n.map((x: string) => [x, `N${x}`])),
    sig: Object.fromEntries(
      c.sig.map((x: string) => [x, [...x].reverse().join("")]),
    ),
  })),
}));

const reply = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }) as Response;

const media =
  "https://rr1---sn-x.googlevideo.com/videoplayback?itag=140&n=nnn&mime=audio%2Fmp4";
const cipher = `s=abc&sp=sig&url=${encodeURIComponent(media)}`;
const answer = {
  playabilityStatus: { status: "OK" },
  videoDetails: { videoId: "dQw4w9WgXcQ" },
  streamingData: {
    expiresInSeconds: "21000",
    adaptiveFormats: [
      {
        itag: 140,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        bitrate: 130000,
        signatureCipher: cipher,
      },
    ],
  },
};

function mockFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("iframe_api")) return reply("x player/abcd1234/ y");
    if (url.includes("/embed/"))
      return reply('{"encryptedHostFlags":"FLAGS","visitorData":"EMBEDVD"}');
    if (url.includes("base.js")) return reply("a={signatureTimestamp:20123}");
    if (url.includes("/youtubei/v1/player")) return reply(answer);
    return reply({}, 206);
  });
  const body = (name: string) =>
    JSON.parse(
      String(
        calls.find(
          (c) =>
            c.url.includes("/player") &&
            c.init.method === "POST" &&
            JSON.parse(String(c.init.body)).context.client.clientName === name,
        )?.init.body,
      ),
    );
  return { fetch, calls, body };
}

const named = (n: string) =>
  DEFAULT_STREAM_CLIENTS_V2.find((c) => c.name === n) as StreamClient;
const tv = named("tv_samsung");
const embedded = named("web_embedded");
const webMusic = named("web_music");
const pot: StreamClient = {
  ...tv,
  name: "pot",
  clientName: "POT",
  needs: ["pot"],
};
const provider = (mint: (b: string) => string | undefined) =>
  ({
    visitorData: jest.fn(async () => "PVD"),
    mint: jest.fn(async (b: string) => mint(b)),
    reportRejected: jest.fn(),
  }) satisfies PoTokenProvider;
const posted = (m: ReturnType<typeof mockFetch>) =>
  m.calls
    .filter((c) => c.init.method === "POST")
    .map((c) => JSON.parse(String(c.init.body)).context.client.clientName);
const sandbox: JsSandbox = { run: jest.fn() };
const track = {
  id: "dQw4w9WgXcQ",
  source: "youtube" as const,
  title: "x",
  artists: [],
};
const yt = (fetch: any, streamClients: StreamClient[], extra = {}) =>
  new YouTubeMusic({ fetch, clientsConfigUrl: null, streamClients, ...extra });

beforeEach(resetPlayerCache);

describe("clients that need JS", () => {
  it("are skipped without a sandbox, and PO-token clients without a provider", async () => {
    const m = mockFetch();
    await expect(
      yt(m.fetch, [tv, pot, embedded]).resolve(track),
    ).rejects.toThrow();
    expect(m.calls).toEqual([]);

    await yt(m.fetch, [pot, tv], { sandbox }).resolve(track);
    const names = m.calls
      .filter((c) => c.init.method === "POST")
      .map((c) => JSON.parse(String(c.init.body)).context.client.clientName);
    expect(names).toEqual(["TVHTML5"]);
  });

  it("send the signature timestamp and thirdParty, then decipher the url", async () => {
    const m = mockFetch();
    const s = await yt(m.fetch, [embedded], { sandbox }).resolve(track);
    const body = m.body("WEB_EMBEDDED_PLAYER");
    expect(body.playbackContext.contentPlaybackContext).toEqual({
      html5Preference: "HTML5_PREF_WANTS",
      signatureTimestamp: 20123,
      encryptedHostFlags: "FLAGS",
    });
    expect(body.context.client.visitorData).toBe("EMBEDVD");
    const post = m.calls.find((c) => c.init.method === "POST");
    expect((post?.init.headers as any).Referer).toBe("https://www.reddit.com/");
    expect(body.context.thirdParty).toEqual({
      embedUrl: "https://www.reddit.com/",
    });
    expect(s.url).toBe(
      "https://rr1---sn-x.googlevideo.com/videoplayback?itag=140&n=Nnnn&mime=audio%2Fmp4&sig=cba",
    );
    expect(s.via).toBe("youtube:web_embedded");
  });
});

describe("clients that need a PO token", () => {
  it("lists web_music first, then the JS and native clients", () => {
    expect(DEFAULT_STREAM_CLIENTS_V2.map((c) => c.name)).toEqual([
      "web_music",
      "tv_samsung",
      "visionos",
      "visionos_app-1.04",
      "visionos_music-1.02",
      "web_embedded",
    ]);
    expect(webMusic.needs).toEqual(["js", "pot"]);
  });

  it("are skipped when the provider mints nothing", async () => {
    const m = mockFetch();
    const p = provider(() => undefined);
    const s = await yt(m.fetch, [webMusic, tv], {
      sandbox,
      poToken: p,
    }).resolve(track);
    expect(posted(m)).toEqual(["TVHTML5"]);
    expect(s.via).toBe("youtube:tv_samsung");
    expect(p.reportRejected).not.toHaveBeenCalled();
  });

  it("send the visitor-bound token to the player and the video-bound one as &pot=", async () => {
    const m = mockFetch();
    const p = provider((b) => (b === "PVD" ? "PLAYERTOK" : `T/${b}`));
    const s = await yt(m.fetch, [webMusic], { sandbox, poToken: p }).resolve(
      track,
    );
    const body = m.body("WEB_REMIX");
    expect(body.serviceIntegrityDimensions).toEqual({ poToken: "PLAYERTOK" });
    expect(body.context.client.visitorData).toBe("PVD");
    const post = m.calls.find((c) => c.init.method === "POST");
    expect((post?.init.headers as any)["X-Goog-Visitor-Id"]).toBe("PVD");
    expect(post?.url).toContain("music.youtube.com");
    expect(s.url).toMatch(/&pot=T%2FdQw4w9WgXcQ$/);
    expect(s.via).toBe("youtube:web_music");
    expect(s.headers?.Origin).toBe("https://music.youtube.com");
  });

  it("report a 403 on the media url once and move to the next client", async () => {
    const m = mockFetch();
    const base = m.fetch.getMockImplementation() as any;
    m.fetch.mockImplementation(async (url: string, init: RequestInit = {}) =>
      url.includes("pot=") ? reply({}, 403) : base(url, init),
    );
    const p = provider((b) => `T${b}`);
    const s = await yt(m.fetch, [webMusic, tv], {
      sandbox,
      poToken: p,
    }).resolve(track);
    expect(p.reportRejected).toHaveBeenCalledTimes(1);
    expect(s.via).toBe("youtube:tv_samsung");
  });
});

describe("ciphered formats", () => {
  it("are chosen only when a sandbox can solve them", () => {
    const f = answer.streamingData.adaptiveFormats;
    expect(pickAudioFormat(f)).toBeUndefined();
    expect(pickAudioFormat(f, "high", false, true)?.itag).toBe(140);
  });

  it("keep needs and thirdParty through a remote config", () => {
    const parsed = parseClientsConfig({ clients: DEFAULT_STREAM_CLIENTS_V2 });
    expect(parsed).toEqual(DEFAULT_STREAM_CLIENTS_V2);
  });
});
