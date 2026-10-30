const HOUR = 3600_000;
let now = 1_800_000_000_000;
const mockState = {
  settings: { cookies: "c" as string | undefined },
  syncedAt: 0,
  applyRemote: jest.fn(),
};
const mockYt = {
  likedSongs: jest.fn(async () => ({ title: "Liked", tracks: [] })),
  libraryPlaylists: jest.fn(async () => [{ id: "VLPL1", title: "New" }]),
  playlistMore: jest.fn(),
};

jest.mock("./clients", () => ({ yt: {}, ytAccount: mockYt }));
jest.mock("./library", () => ({
  useLibrary: { getState: () => mockState, setState: jest.fn() },
  onLike: jest.fn(),
  onDislike: jest.fn(),
}));
jest.mock("./storage", () => ({ kv: { get: jest.fn(), set: jest.fn() } }));
jest.mock("../lib/desktop", () => ({ desktop: undefined }));

// Fresh module per test: the last playlist refresh time lives in it.
const load = () => require("./account") as typeof import("./account");

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mockState.settings.cookies = "c";
  mockState.syncedAt = now - HOUR;
});

test("a recent full sync still re-reads the playlist list on a visit, at most every 10 minutes", async () => {
  const { maybeSyncLibrary } = load();
  expect(await maybeSyncLibrary()).toBe(true);
  expect(mockYt.libraryPlaylists).toHaveBeenCalledTimes(1);
  expect(mockYt.likedSongs).not.toHaveBeenCalled();
  expect(mockState.applyRemote).toHaveBeenCalledWith({
    playlists: [{ id: "VLPL1", title: "New" }],
  });

  now += 5 * 60_000;
  expect(await maybeSyncLibrary()).toBe(false);
  now += 6 * 60_000;
  expect(await maybeSyncLibrary()).toBe(true);
  expect(mockYt.libraryPlaylists).toHaveBeenCalledTimes(2);
});

test("a refused playlist read waits its turn instead of retrying on every visit", async () => {
  mockYt.libraryPlaylists.mockRejectedValueOnce(new Error("403"));
  const { maybeSyncLibrary } = load();
  await expect(maybeSyncLibrary()).rejects.toThrow("403");
  expect(await maybeSyncLibrary()).toBe(false);
  expect(mockYt.libraryPlaylists).toHaveBeenCalledTimes(1);
});

test("an old sync pulls likes too, and signed out nothing is asked", async () => {
  mockState.syncedAt = now - 10 * HOUR;
  const { maybeSyncLibrary } = load();
  await maybeSyncLibrary();
  expect(mockYt.likedSongs).toHaveBeenCalledTimes(1);
  expect(mockYt.libraryPlaylists).toHaveBeenCalledTimes(1);

  jest.clearAllMocks();
  mockState.settings.cookies = undefined;
  mockState.syncedAt = 0;
  expect(await load().maybeSyncLibrary()).toBe(false);
  expect(mockYt.libraryPlaylists).not.toHaveBeenCalled();
});

test("pull to refresh syncs likes and playlists now, but not twice within 30 s", async () => {
  const { refreshLibrary } = load();
  mockState.syncedAt = now - 60_000;
  await refreshLibrary();
  expect(mockYt.likedSongs).toHaveBeenCalledTimes(1);
  mockState.syncedAt = now - 10_000;
  await refreshLibrary();
  expect(mockYt.likedSongs).toHaveBeenCalledTimes(1);
});

test("songs without a setVideoId are refused, not reported as removed", async () => {
  const { removeFromYouTubePlaylist } = load();
  const track = { id: "a", source: "youtube" } as never;
  await expect(removeFromYouTubePlaylist("VLPL1", [track])).rejects.toThrow(
    /can't be removed/,
  );
});
