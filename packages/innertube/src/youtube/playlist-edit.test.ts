import { YouTubeMusic } from "./music";

const COOKIE = "SAPISID=abc; SID=xyz";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function client(
  status: string | null = "STATUS_SUCCEEDED",
  endpoint = "/browse/edit_playlist",
) {
  const bodies: any[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    if (!url.includes(endpoint)) return reply({});
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

  it("moves an entry before its successor, or to the end without one", async () => {
    const { yt, bodies } = client();
    await yt.movePlaylistItem("VLPL123", "S1", "S4");
    await yt.movePlaylistItem("PL123", "S2");
    expect(bodies[0].playlistId).toBe("PL123");
    expect(bodies[0].actions).toEqual([
      {
        action: "ACTION_MOVE_VIDEO_BEFORE",
        setVideoId: "S1",
        movedSetVideoIdSuccessor: "S4",
      },
    ]);
    expect(bodies[1].actions).toEqual([
      { action: "ACTION_MOVE_VIDEO_BEFORE", setVideoId: "S2" },
    ]);
  });

  it("renames, describes and sets privacy", async () => {
    const { yt, bodies } = client();
    await yt.renamePlaylist("PL123", "Road trip");
    await yt.setPlaylistDescription("PL123", "");
    await yt.setPlaylistPrivacy("PL123", "UNLISTED");
    expect(bodies.map((b) => b.actions)).toEqual([
      [{ action: "ACTION_SET_PLAYLIST_NAME", playlistName: "Road trip" }],
      [{ action: "ACTION_SET_PLAYLIST_DESCRIPTION", playlistDescription: "" }],
      [{ action: "ACTION_SET_PLAYLIST_PRIVACY", playlistPrivacy: "UNLISTED" }],
    ]);
  });

  it("deletes through playlist/delete with the bare id", async () => {
    const { yt, bodies } = client("STATUS_SUCCEEDED", "/playlist/delete");
    await yt.deletePlaylist("VLPL123");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].playlistId).toBe("PL123");
    expect(bodies[0].actions).toBeUndefined();
  });

  it("accepts a delete answered without a status but not a refused one", async () => {
    await expect(
      client(null, "/playlist/delete").yt.deletePlaylist("PL1"),
    ).resolves.toBeUndefined();
    await expect(
      client("STATUS_FAILED", "/playlist/delete").yt.deletePlaylist("PL1"),
    ).rejects.toThrow(/STATUS_FAILED/);
  });

  it("throws when a rename or move is not confirmed", async () => {
    await expect(
      client("STATUS_FAILED").yt.renamePlaylist("PL1", "x"),
    ).rejects.toThrow(/STATUS_FAILED/);
    await expect(
      client(null).yt.movePlaylistItem("PL1", "S1", "S2"),
    ).rejects.toThrow(/no status/);
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
    await expect(yt.deletePlaylist("PL1")).rejects.toThrow(/signed in/);
    await expect(yt.renamePlaylist("PL1", "x")).rejects.toThrow(/signed in/);
  });
});
