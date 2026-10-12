import { EJS_CORE } from "../../../vendor/ejs/generated/core";
import { EJS_INFO } from "../../../vendor/ejs/generated/info";
import { EJS_LIB } from "../../../vendor/ejs/generated/lib";
import type { JsSandbox } from "../sandbox";
import { createNodeSandbox } from "./node-sandbox";
import { ChallengeError, type PlayerJs } from "./player";
import { resetSolverCache, solveChallenges } from "./solver";

// requireActual keeps this file free of node type declarations (the package only loads jest types).
const { createHash } = jest.requireActual("node:crypto");

const player: PlayerJs = {
  id: "abcd1234",
  url: "u",
  js: "PLAYER_JS",
  sts: 20000,
};
const reverse = (s: string) => [...s].reverse().join("");
type Input = {
  type: string;
  requests: { type: string; challenges: string[] }[];
};

/** Runs the solver's code against a fake global whose "installed EJS" reverses every challenge. */
function fakeSandbox() {
  const log: string[] = [];
  let global: Record<string, unknown> = {};
  const jsc = (i: Input) => {
    log.push(`jsc:${i.type}`);
    return {
      type: "result",
      ...(i.type === "player" ? { preprocessed_player: "PRE" } : {}),
      responses: i.requests.map((r) => ({
        type: "result",
        data: Object.fromEntries(r.challenges.map((c) => [c, reverse(c)])),
      })),
    };
  };
  const sandbox: JsSandbox = {
    async run<T>(code: string) {
      if (code.startsWith(EJS_LIB)) {
        log.push("install");
        global.__pawseEjs = { jsc, version: EJS_INFO.version, pre: {} };
        return true as T;
      }
      log.push(
        code.includes('"player":"PLAYER_JS"')
          ? "run+player"
          : code.includes('"preprocessed":"PRE"')
            ? "run+pre"
            : "run",
      );
      // biome-ignore lint/security/noGlobalEval: test double
      const fn = new Function("globalThis", `return (async () => {${code}})()`);
      return JSON.parse(JSON.stringify(await fn(global))) as T;
    },
  };
  return { sandbox, log, reload: () => (global = {}) };
}

beforeEach(resetSolverCache);

describe("solveChallenges protocol", () => {
  it("installs once, sends the player once, then reuses the preprocessed player and results", async () => {
    const { sandbox, log, reload } = fakeSandbox();
    const s = "ABCDEF";
    const out = await solveChallenges(sandbox, player, { n: ["n1"], sig: [s] });
    expect(out).toEqual({ n: { n1: "1n" }, sig: { [s]: "FEDCBA" } });
    expect(log).toEqual(["run", "install", "run", "run+player", "jsc:player"]);

    log.length = 0;
    // same n, same sig length: no sandbox work at all
    expect(
      await solveChallenges(sandbox, player, { n: ["n1"], sig: ["UVWXYZ"] }),
    ).toEqual({ n: { n1: "1n" }, sig: { UVWXYZ: "ZYXWVU" } });
    expect(log).toEqual([]);

    await solveChallenges(sandbox, player, { n: ["n2"] });
    expect(log).toEqual(["run", "jsc:preprocessed"]);

    // sandbox lost its state: reinstall and hand it the app's preprocessed copy, not the raw player
    log.length = 0;
    reload();
    await solveChallenges(sandbox, player, { n: ["n3"] });
    expect(log).toEqual([
      "run",
      "install",
      "run",
      "run+pre",
      "jsc:preprocessed",
    ]);
  });

  it("accepts a signature spec shorter than the input (dropped characters)", async () => {
    const sandbox: JsSandbox = {
      run: async <T>(code: string) => {
        const probe = /"challenges":\["([^\]]*)"\]/.exec(code)?.[1];
        return {
          responses: [
            {
              type: "result",
              data: { [JSON.parse(`"${probe}"`)]: "\u0003\u0001" },
            },
          ],
        } as T;
      },
    };
    const out = await solveChallenges(sandbox, player, { sig: ["ABCD"] });
    expect(out.sig.ABCD).toBe("DB");
  });

  it("throws ChallengeError when EJS cannot solve a challenge", async () => {
    const sandbox: JsSandbox = {
      run: async <T>() =>
        ({
          responses: [{ type: "error", error: "no n function" }],
        }) as T,
    };
    await expect(
      solveChallenges(sandbox, player, { n: ["x"] }),
    ).rejects.toBeInstanceOf(ChallengeError);
  });
});

describe("vendored EJS", () => {
  it("matches the SHA3-512 hashes yt-dlp pins", () => {
    const h = (t: string) => createHash("sha3-512").update(t).digest("hex");
    expect(h(EJS_LIB)).toBe(EJS_INFO.sha3_512["yt.solver.lib.min.js"]);
    expect(h(EJS_CORE)).toBe(EJS_INFO.sha3_512["yt.solver.core.min.js"]);
  });

  it("loads in the Node sandbox and reports a bad player as an error", async () => {
    const sandbox = createNodeSandbox();
    const bad = { ...player, id: "00000000", js: "var x = 1;" };
    await expect(
      solveChallenges(sandbox, bad, { n: ["abc"] }),
    ).rejects.toBeInstanceOf(ChallengeError);
    expect(await sandbox.run("return typeof globalThis.__pawseEjs.jsc")).toBe(
      "function",
    );
  });
});
