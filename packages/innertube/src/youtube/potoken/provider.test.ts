import type { JsSandbox } from "../sandbox";
import { parseCreate, parseHomepage } from "./challenge";
import { WebPoTokenProvider } from "./provider";

const js = (o: unknown) =>
  JSON.stringify(o).replace(/[^\w ]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
const HOME = `<script>ytcfg.set({"VISITOR_DATA":"VD1","STS":20732,"EVENT_ID":"e"});</script>
<script>window.ytAtN({'R': '${js({ bgChallenge: { program: "PROG", globalName: "gn", interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "//www.google.com/js/th/x.js" } } })}'});</script>`;

type Reply = { status: number; body: string };
function setup(routes: Partial<Record<"home" | "create" | "generate", () => Reply>> = {}) {
  let clock = 1_000_000;
  const calls = { home: 0, create: 0, generate: 0, start: 0, mint: 0 };
  const sandbox: JsSandbox & { failMint?: boolean } = {
    async run<T>(code: string): Promise<T> {
      if (code.includes("navigator.userAgent")) return "UA" as T;
      if (code.includes("__pawseBg.start(")) return (calls.start++, "bgresp") as T;
      if (code.includes("__pawseBg.unlock(")) return true as T;
      const m = code.match(/__pawseBg\.mint\("([^"]*)"\)/);
      if (m) {
        if (sandbox.failMint) throw new Error("BotGuard minter not ready");
        return `tok-${m[1]}-${++calls.mint}` as T;
      }
      throw new Error(`unexpected ${code.slice(0, 40)}`);
    },
  };
  const reply = ({ status, body }: Reply) => new Response(body, { status });
  const fetch = async (url: string) => {
    if (url === "https://www.youtube.com/") {
      calls.home++;
      return reply(routes.home?.() ?? { status: 200, body: HOME });
    }
    if (url.endsWith("/Create")) {
      calls.create++;
      return reply(routes.create?.() ?? { status: 500, body: "" });
    }
    if (url.endsWith("/GenerateIT")) {
      calls.generate++;
      return reply(routes.generate?.() ?? { status: 200, body: JSON.stringify(["SVQ=", 43200, 21600]) });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const provider = new WebPoTokenProvider({ fetch, sandbox, now: () => clock });
  return { provider, calls, sandbox, tick: (ms: number) => (clock += ms) };
}

describe("WebPoTokenProvider", () => {
  it("mints from the homepage challenge and caches per binding", async () => {
    const { provider, calls } = setup();
    expect(await provider.visitorData()).toBe("VD1");
    expect(await provider.mint("vid1")).toBe("tok-vid1-1");
    expect(await provider.mint("vid1")).toBe("tok-vid1-1");
    expect(await provider.mint("VD1")).toBe("tok-VD1-2");
    expect(calls).toMatchObject({ home: 1, create: 0, generate: 1, start: 1, mint: 2 });
    expect((await provider.ytcfg())?.STS).toBe(20732);
  });

  it("starts once for concurrent callers", async () => {
    const { provider, calls } = setup();
    await Promise.all([provider.mint("a"), provider.mint("b"), provider.visitorData()]);
    expect(calls.start).toBe(1);
  });

  it("renews the integrity token 10 minutes before it expires", async () => {
    const { provider, calls, tick } = setup();
    await provider.mint("v");
    tick(43200_000 - 10 * 60_000 - 1);
    expect(await provider.mint("v")).toBe("tok-v-1");
    tick(2);
    expect(await provider.mint("v")).toBe("tok-v-2");
    expect(calls.generate).toBe(2);
  });

  it("cools down for 60 s after a failed start", async () => {
    const { provider, calls, tick } = setup({
      home: () => ({ status: 500, body: "" }),
      generate: () => ({ status: 200, body: "[null]" }),
    });
    expect(await provider.mint("v")).toBeUndefined();
    expect(calls).toMatchObject({ home: 1, create: 1 });
    tick(59_000);
    expect(await provider.mint("v")).toBeUndefined();
    expect(await provider.visitorData()).toBeUndefined();
    expect(calls.home).toBe(1);
    tick(2_000);
    await provider.mint("v");
    expect(calls.home).toBe(2);
  });

  it("falls back to the Create challenge", async () => {
    const inner = JSON.stringify(["m", null, ["//www.google.com/js/th/y.js"], "h", "P2", "g2"]);
    const scrambled = btoa(String.fromCharCode(...[...inner].map((c) => (c.charCodeAt(0) - 97) & 0xff)));
    const { provider, calls } = setup({
      home: () => ({ status: 200, body: "<html>consent</html>" }),
      create: () => ({ status: 200, body: JSON.stringify([null, scrambled]) }),
    });
    expect(await provider.mint("v")).toBe("tok-v-1");
    expect(calls.create).toBe(1);
  });

  it("drops the minter when YouTube rejects a token, backing off if it was fresh", async () => {
    const { provider, calls, tick } = setup();
    await provider.mint("v");
    tick(5 * 60_000);
    provider.reportRejected();
    expect(await provider.mint("v")).toBe("tok-v-2");
    expect(calls.start).toBe(2);
    provider.reportRejected();
    expect(await provider.mint("v")).toBeUndefined();
    expect(calls.start).toBe(2);
  });

  it("restarts once when an older page lost its minter", async () => {
    const { provider, calls, sandbox, tick } = setup();
    await provider.mint("a");
    tick(60_000);
    sandbox.failMint = true;
    const p = provider.mint("b");
    expect(await p).toBeUndefined();
    expect(calls.start).toBe(2);
    sandbox.failMint = false;
    tick(61_000);
    expect(await provider.mint("b")).toBe("tok-b-2");
  });
});

describe("challenge parsing", () => {
  it("reads the homepage ytAtN challenge with an absolute interpreter URL", () => {
    expect(parseHomepage(HOME)).toEqual({
      program: "PROG",
      globalName: "gn",
      interpreterUrl: "https://www.google.com/js/th/x.js",
      ytcfg: { VISITOR_DATA: "VD1", STS: 20732, EVENT_ID: "e" },
    });
  });

  it("reads an unscrambled Create answer with inline interpreter", () => {
    expect(parseCreate([["m", ["JS"], null, "h", "P", "g"]])).toEqual({
      program: "P",
      globalName: "g",
      interpreterJs: "JS",
    });
  });
});
