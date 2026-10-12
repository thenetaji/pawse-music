// Runs yt-dlp/ejs (Unlicense) the way yt-dlp's jsc director does: lib + Object.assign(globalThis, lib) + core + jsc(input).
import { EJS_CORE } from "../../../vendor/ejs/generated/core";
import { EJS_INFO } from "../../../vendor/ejs/generated/info";
import { EJS_LIB } from "../../../vendor/ejs/generated/lib";
import type { JsSandbox } from "../sandbox";
import { ChallengeError, type PlayerJs } from "./player";

export interface Challenges {
  n?: string[];
  /** Encrypted `s` values from signatureCipher. */
  sig?: string[];
}

/** Solved values keyed by challenge: n -> new n, s -> deciphered signature. */
export interface Solved {
  n: Record<string, string>;
  sig: Record<string, string>;
}

type EjsRequest = { type: "n" | "sig"; challenges: string[] };
type EjsResponse =
  | { type: "result"; data: Record<string, string | null> }
  | { type: "error"; error: string };
type RunResult =
  | { missing: "solver" | "player" }
  | { error: string }
  | { responses: EjsResponse[]; preprocessed?: string };

const STATE = "globalThis.__pawseEjs";
const INSTALL_TIMEOUT_MS = 15_000;
const PLAYER_TIMEOUT_MS = 30_000;
const SOLVE_TIMEOUT_MS = 10_000;
const MAX_ENTRIES = 2000;

// Sandbox side: installs once, keeps the newest preprocessed player, and asks for whatever it lacks.
const installCode = () =>
  `${EJS_LIB}\n;Object.assign(globalThis, lib);\n${EJS_CORE}\n;${STATE} = { jsc: jsc, version: ${JSON.stringify(EJS_INFO.version)}, pre: {} };\nreturn true;`;

const solveCode = (input: object) => `
const s = ${STATE};
if (!s || s.version !== ${JSON.stringify(EJS_INFO.version)}) return { missing: "solver" };
const i = ${JSON.stringify(input)};
if (i.player === undefined && i.preprocessed !== undefined) s.pre = { [i.id]: i.preprocessed };
if (i.player === undefined && !s.pre[i.id]) return { missing: "player" };
let out;
try {
  out = i.player !== undefined
    ? s.jsc({ type: "player", player: i.player, requests: i.requests, output_preprocessed: true })
    : s.jsc({ type: "preprocessed", preprocessed_player: s.pre[i.id], requests: i.requests });
} catch (e) {
  return { error: String(e && e.message || e) };
}
if (!out || out.type !== "result") return { error: String(out && out.error) };
if (i.player !== undefined && out.preprocessed_player) s.pre = { [i.id]: out.preprocessed_player };
return { responses: out.responses, preprocessed: i.player !== undefined ? out.preprocessed_player : undefined };`;

// App side: preprocessed player per id (survives a sandbox reload), n results and sig permutations per player.
const preprocessed = new Map<string, string>();
const nCache = new Map<string, string>();
const sigCache = new Map<string, number[]>();

const remember = <V>(m: Map<string, V>, k: string, v: V) => {
  m.set(k, v);
  if (m.size > MAX_ENTRIES) m.delete(m.keys().next().value!);
};

/** yt-dlp probes sig with chr(0..len-1); the answer is a permutation reused for every s of that length. */
const probe = (len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(i)).join("");

async function runEjs(
  sandbox: JsSandbox,
  player: PlayerJs,
  requests: EjsRequest[],
): Promise<EjsResponse[]> {
  let installed = false;
  let payload: { player?: string; preprocessed?: string } = {};
  for (let step = 0; step < 4; step++) {
    const r = await sandbox.run<RunResult>(
      solveCode({ id: player.id, requests, ...payload }),
      payload.player !== undefined ? PLAYER_TIMEOUT_MS : SOLVE_TIMEOUT_MS,
    );
    if (r && "responses" in r) {
      if (r.preprocessed) {
        preprocessed.clear();
        preprocessed.set(player.id, r.preprocessed);
      }
      return r.responses;
    }
    if (r && "error" in r) throw new ChallengeError(`ejs: ${r.error}`);
    if (r?.missing === "solver" && !installed) {
      await sandbox.run(installCode(), INSTALL_TIMEOUT_MS);
      installed = true;
    } else if (
      r?.missing === "player" &&
      !payload.preprocessed &&
      !payload.player
    ) {
      const pre = preprocessed.get(player.id);
      payload =
        pre !== undefined ? { preprocessed: pre } : { player: player.js };
    } else if (r?.missing === "player" && payload.preprocessed) {
      payload = { player: player.js };
    } else break;
  }
  throw new ChallengeError("ejs sandbox did not accept the solver");
}

/** Solves n and sig challenges for `player`; throws ChallengeError unless every one is solved. */
export async function solveChallenges(
  sandbox: JsSandbox,
  player: PlayerJs,
  { n = [], sig = [] }: Challenges,
): Promise<Solved> {
  const key = (x: string | number) => `${player.id}:${x}`;
  const nTodo = [...new Set(n)].filter((c) => !nCache.has(key(c)));
  const lenTodo = [...new Set(sig.map((s) => s.length))].filter(
    (l) => !sigCache.has(key(l)),
  );
  const requests: EjsRequest[] = [];
  if (nTodo.length) requests.push({ type: "n", challenges: nTodo });
  if (lenTodo.length)
    requests.push({ type: "sig", challenges: lenTodo.map(probe) });

  const errors: string[] = [];
  if (requests.length) {
    const responses = await runEjs(sandbox, player, requests);
    requests.forEach((req, i) => {
      const res = responses[i];
      if (res?.type !== "result") {
        errors.push(`${req.type}: ${res?.error ?? "no response"}`);
        return;
      }
      for (const c of req.challenges) {
        const out = res.data[c];
        if (typeof out !== "string") continue;
        if (req.type === "n") remember(nCache, key(c), out);
        else {
          // The result may be shorter than the probe (characters dropped), but every char is an index into it.
          const spec = Array.from(out, (ch) => ch.charCodeAt(0));
          if (spec.length && spec.every((i) => i < c.length))
            remember(sigCache, key(c.length), spec);
        }
      }
    });
  }

  const solved: Solved = { n: {}, sig: {} };
  for (const c of n) {
    const v = nCache.get(key(c));
    if (v === undefined) errors.push(`n unsolved: ${c}`);
    else solved.n[c] = v;
  }
  for (const s of sig) {
    const perm = sigCache.get(key(s.length));
    if (!perm) errors.push(`sig unsolved for length ${s.length}`);
    else solved.sig[s] = perm.map((i) => s[i]).join("");
  }
  if (errors.length)
    throw new ChallengeError([...new Set(errors)].join("; ").slice(0, 300));
  return solved;
}

/** Test hook: drop every cached player and result. */
export function resetSolverCache() {
  preprocessed.clear();
  nCache.clear();
  sigCache.clear();
}
