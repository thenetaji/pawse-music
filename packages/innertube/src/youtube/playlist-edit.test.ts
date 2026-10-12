import { YouTubeMusic } from "./music";

const COOKIE = "SAPISID=abc; SID=xyz";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function client(status: string | null = "STATUS_SUCCEEDED") {
  const bodies: any[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    if (!url.includes("/browse/edit_playlist")) return reply({});
    bodies.push(JSON.parse(String(init.body)));
    return reply(status ? { status } : {});
  });
  const yt = new YouTubeMusic({
    fetch,
    clientsConfigUrl: null,
    cookies: () => COOKIE,
  });
  return { yt, bodies };
}

describe("playlist edits", () => {
  it("adds in batches of 50, strips VL and skips duplicates", async () => {
    const { yt, bodies } = client();
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
    await yt.addToPlaylist("VLPL123", [...ids, "v0"]);
    expect(bodies.map((b) => b.actions.length)).toEqual([50, 50, 20]);
    expect(bodies.every((b) => b.playlistId === "PL123")).toBe(true);
    expect(bodies[0].actions[0]).toEqual({
      action: "ACTION_ADD_VIDEO",
      addedVideoId: "v0",
      dedupeOption: "DEDUPE_OPTION_SKIP",
    });
  });

  it("removes by setVideoId", async () => {
    const { yt, bodies } = client();
    await yt.removeFromPlaylist("PL123", [{ videoId: "a", setVideoId: "S1" }]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].playlistId).toBe("PL123");
    expect(bodies[0].actions).toEqual([
      { action: "ACTION_REMOVE_VIDEO", setVideoId: "S1", removedVideoId: "a" },
    ]);
  });

  it("throws when YouTube does not report success", async () => {
    await expect(
      client("STATUS_FAILED").yt.addToPlaylist("PL1", ["a"]),
    ).rejects.toThrow(/STATUS_FAILED/);
    await expect(client(null).yt.addToPlaylist("PL1", ["a"])).rejects.toThrow(
      /no status/,
    );
  });

  it("refuses when signed out", async () => {
    const yt = new YouTubeMusic({
      fetch: jest.fn(async () => reply({})),
      clientsConfigUrl: null,
      cookies: () => null,
    });
    await expect(yt.addToPlaylist("PL1", ["a"])).rejects.toThrow(/signed in/);
  });
});
