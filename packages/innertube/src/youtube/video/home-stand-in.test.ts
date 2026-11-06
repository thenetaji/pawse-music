import { YouTubeVideo } from "./client";

const COOKIE = "SAPISID=abc; SID=xyz";
const fetchEmptyFeed = jest.fn(async (url: string) =>
  url.includes("/youtubei/")
    ? new Response("{}", { status: 200 })
    : new Response('"INNERTUBE_CLIENT_VERSION":"2.20261101.00.00"', {
        status: 200,
      }),
);

describe("home with an empty feed", () => {
  it("marks popular videos as standing in for a signed-in account's feed", async () => {
    const yt = new YouTubeVideo({
      fetch: fetchEmptyFeed,
      cookies: () => COOKIE,
    });
    expect((await yt.home()).standIn).toBe(true);
  });

  it("doesn't mark them for a signed-out visitor, who expects popular videos", async () => {
    const yt = new YouTubeVideo({ fetch: fetchEmptyFeed, learn: () => true });
    expect((await yt.home()).standIn).toBeUndefined();
  });
});
