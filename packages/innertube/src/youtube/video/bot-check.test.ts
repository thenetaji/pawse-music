import botCheck from "../../__fixtures__/player-bot-check.json";
import player from "../../__fixtures__/player-visionos.json";
import { isYouTubeResting } from "../stream";
import { YouTubeVideo } from "./client";

const MIN = 60_000;
const playable = {
  ...player,
  streamingData: {
    ...player.streamingData,
    adaptiveFormats: [
      {
        itag: 137,
        height: 1080,
        bitrate: 4_000_000,
        mimeType: 'video/mp4; codecs="avc1.640028"',
        url: "https://rr1.googlevideo.com/videoplayback?itag=137",
      },
      ...player.streamingData.adaptiveFormats,
    ],
  },
};

function setup(answers: unknown[]) {
  const asked: string[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    if (!url.includes("/youtubei/v1/player"))
      return { ok: false, status: 404, text: async () => "" } as Response;
    asked.push(JSON.parse(String(init.body)).context.client.clientName);
    const body = answers[Math.min(asked.length - 1, answers.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  const v = new YouTubeVideo({ fetch, clientsConfigUrl: null });
  const play = () =>
    v.resolveStream("dQw4w9WgXcQ", { verify: false }).catch((e: Error) => e);
  return { asked, play, answers };
}

let now = Date.UTC(2026, 10, 3);
beforeEach(() => {
  now = Date.UTC(2026, 10, 3);
  jest.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

it("tries a token-free client after two bot checks, then skips the refused ones", async () => {
  const t = setup([botCheck, botCheck, playable]);
  expect(await t.play()).toMatchObject({ video: expect.anything() });
  expect(t.asked).toHaveLength(4);

  t.asked.length = 0;
  t.answers.splice(0, 3, playable);
  expect(await t.play()).toMatchObject({ video: expect.anything() });
  // The two clients that got a bot check sit out: the first ask goes to the one that played.
  expect(t.asked).toHaveLength(2);
});

it("rests after a resolve ends on a bot check, without asking YouTube again", async () => {
  const t = setup([botCheck]);
  expect(await t.play()).toMatchObject({ code: "blocked" });
  const asked = t.asked.length;
  expect(asked).toBe(3);

  now += 4 * MIN;
  expect(isYouTubeResting(await t.play())).toBe(true);
  expect(t.asked).toHaveLength(asked);

  now += 2 * MIN;
  t.answers.splice(0, 1, playable);
  expect(await t.play()).toMatchObject({ video: expect.anything() });
});
