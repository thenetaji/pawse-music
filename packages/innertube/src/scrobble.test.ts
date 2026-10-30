import { LastFm, ListenBrainz, scrobbleAfterSec } from "./scrobble";

// requireActual keeps this file free of node type declarations (the package only loads jest types).
const { createHash } = jest.requireActual("node:crypto");
const md5 = async (t: string) => createHash("md5").update(t).digest("hex");

test("a song counts at half its length, but never later than four minutes", () => {
  expect(scrobbleAfterSec(200)).toBe(100);
  expect(scrobbleAfterSec(900)).toBe(240);
  expect(scrobbleAfterSec(29)).toBeUndefined();
});

test("Last.fm signs the sorted parameters, left out format, with the secret", async () => {
  const lf = new LastFm({ apiKey: "k", secret: "s3cret", md5 });
  expect(
    await lf.sign({ method: "auth.getToken", api_key: "k", format: "json" }),
  ).toBe(await md5("api_keykmethodauth.getTokens3cret"));
});

test("Last.fm scrobbles are numbered, and its errors say whether to try again", async () => {
  const bodies: string[] = [];
  const answers = [
    { scrobbles: {} },
    { error: 11 },
    { error: 9 },
    { error: 6 },
  ];
  const fetch = jest.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(String(init?.body));
    return new Response(JSON.stringify(answers.shift()));
  });
  const lf = new LastFm({
    fetch,
    apiKey: "k",
    secret: "s",
    md5,
    sessionKey: "sk",
  });
  const l = {
    artist: "A & B",
    title: "Dil",
    startedAt: 100,
    durationSec: 200.4,
  };
  expect(await lf.scrobble([l])).toBe("ok");
  expect(bodies[0]).toContain("artist%5B0%5D=A%20%26%20B");
  expect(bodies[0]).toContain("timestamp%5B0%5D=100");
  expect(bodies[0]).toContain("duration%5B0%5D=200");
  expect(await lf.scrobble([l])).toBe("retry");
  expect(await lf.scrobble([l])).toBe("signed-out");
  expect(await lf.scrobble([l])).toBe("rejected");
});

test("ListenBrainz sends a single listen, a backlog as an import, and now playing without a time", async () => {
  const sent: any[] = [];
  const fetch = jest.fn(async (_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  });
  const lb = new ListenBrainz({
    fetch,
    token: "t",
    client: { name: "Pawse", version: "1" },
  });
  const l = { artist: "A", title: "T", startedAt: 5 };
  await lb.scrobble([l]);
  await lb.scrobble([l, l]);
  await lb.nowPlaying(l);
  expect(sent.map((s) => s.listen_type)).toEqual([
    "single",
    "import",
    "playing_now",
  ]);
  expect(sent[0].payload[0].listened_at).toBe(5);
  expect(sent[2].payload[0].listened_at).toBeUndefined();
});
