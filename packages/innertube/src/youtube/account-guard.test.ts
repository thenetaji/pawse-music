import { YouTubeMusic } from "./music";

const COOKIE = "SAPISID=abc; SID=xyz";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const cookieOf = (init: RequestInit = {}) =>
  (init.headers as Record<string, string> | undefined)?.Cookie;

describe("signed-in safety", () => {
  it("searches as the account, except in private search", async () => {
    const sent: { url: string; cookie?: string }[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/youtubei/v1/"))
        sent.push({ url, cookie: cookieOf(init) });
      return reply({});
    });
    let incognito = false;
    const yt = new YouTubeMusic({
      fetch,
      clientsConfigUrl: null,
      cookies: () => COOKIE,
      privateSearch: () => incognito,
    });
    await yt.search("tum hi ho").catch(() => {});
    await yt.home().catch(() => {});
    incognito = true;
    await yt.search("tum hi ho").catch(() => {});
    const searches = sent.filter((s) => s.url.includes("/search"));
    expect(searches[0]?.cookie).toBe(COOKIE);
    expect(searches.at(-1)?.cookie).toBeUndefined();
    expect(sent.find((s) => s.url.includes("/browse"))?.cookie).toBe(COOKIE);
  });

  it("never retries a signed-in 429, then rests the account", async () => {
    const browse: (string | undefined)[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (!url.includes("/browse")) return reply({});
      browse.push(cookieOf(init));
      return reply({}, browse.length === 1 ? 429 : 200);
    });
    const errors: string[] = [];
    const yt = new YouTubeMusic({
      fetch,
      clientsConfigUrl: null,
      cookies: () => COOKIE,
      onRequestError: (ep) => errors.push(ep),
    });
    await expect(yt.home()).rejects.toThrow();
    expect(browse).toEqual([COOKIE]);
    expect(errors).toContain("account");
    // Resting: reads go out signed out, writes refuse.
    await yt.home().catch(() => {});
    expect(browse[1]).toBeUndefined();
    await expect(yt.rate("abc", "like")).rejects.toThrow();
  });
});
