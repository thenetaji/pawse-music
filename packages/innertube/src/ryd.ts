import { base64Decode, base64Encode } from "./util/bytes";
import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";
import { compress, leadingZeroBits, sha512Init } from "./util/sha512";

// Protocol of the Return YouTube Dislike extension (common/vote-client.js): a 36-character user id is
// registered with a proof-of-work puzzle, and every vote is confirmed with another.
const API = "https://returnyoutubedislikeapi.com";
const TIMEOUT_MS = 10_000;
// Attempts between pauses, so the app keeps drawing frames while a puzzle is solved.
const CHUNK = 150;

export type Puzzle = { challenge: string; difficulty: number };

const turn = () => new Promise<void>((r) => setTimeout(r, 6));

/** The 4-byte counter (base64) that makes SHA-512(counter + challenge) start with `difficulty` zero bits. */
export async function solvePuzzle(
  puzzle: Puzzle,
  o: { chunk?: number; pause?: () => Promise<void> } = {},
): Promise<string | undefined> {
  const challenge = base64Decode(puzzle.challenge);
  if (challenge.length !== 16) return undefined;
  const { chunk = CHUNK, pause = turn } = o;
  const m = new Int32Array(32);
  const msg = new DataView(new ArrayBuffer(20));
  new Uint8Array(msg.buffer).set(challenge, 4);
  for (let i = 1; i < 5; i++) m[i] = msg.getInt32(i * 4);
  m[5] = 0x80000000 | 0;
  m[31] = 160;
  const h = new Int32Array(16);
  const limit = 2 ** puzzle.difficulty * 3;
  for (let counter = 0; counter < limit; ) {
    for (
      const end = Math.min(limit, counter + chunk);
      counter < end;
      counter++
    ) {
      // The counter is little-endian in the message, the words big-endian.
      m[0] =
        ((counter & 0xff) << 24) |
        (((counter >>> 8) & 0xff) << 16) |
        (((counter >>> 16) & 0xff) << 8) |
        ((counter >>> 24) & 0xff) |
        0;
      sha512Init(h);
      compress(h, m);
      if (leadingZeroBits(h) >= puzzle.difficulty) {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, counter, true);
        return base64Encode(out);
      }
    }
    await pause();
  }
  return undefined;
}

export interface RydIdentity {
  userId: string;
  registered: boolean;
}

export interface RydVoteOptions {
  fetch?: FetchLike;
  identity: () => RydIdentity;
  save: (id: RydIdentity) => void;
  newUserId: () => string;
  pause?: () => Promise<void>;
}

export class RydVotes {
  private readonly f: FetchLike;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly o: RydVoteOptions) {
    this.f = o.fetch ?? defaultFetch;
  }

  private post(path: string, body: unknown) {
    return fetchWithTimeout(
      this.f,
      API + path,
      {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      TIMEOUT_MS,
    );
  }

  private async register(): Promise<string> {
    const { userId } = this.o.identity();
    const path = `/puzzle/registration?userId=${encodeURIComponent(userId)}`;
    const res = await fetchWithTimeout(
      this.f,
      API + path,
      { credentials: "omit", headers: { Accept: "application/json" } },
      TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`RYD registration HTTP ${res.status}`);
    const solution = await solvePuzzle((await res.json()) as Puzzle, {
      pause: this.o.pause,
    });
    if (!solution) throw new Error("RYD registration puzzle unsolved");
    const done = await this.post(path, { solution });
    if (!done.ok || (await done.json()) !== true)
      throw new Error(`RYD registration refused (HTTP ${done.status})`);
    this.o.save({ userId, registered: true });
    return userId;
  }

  vote(videoId: string, value: -1 | 0 | 1): Promise<void> {
    const run = () => this.attempt(videoId, value, true);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private async attempt(
    videoId: string,
    value: -1 | 0 | 1,
    mayRetry: boolean,
  ): Promise<void> {
    let id = this.o.identity();
    if (!id.registered)
      id = { userId: await this.register(), registered: true };
    const res = await this.post("/interact/vote", {
      userId: id.userId,
      videoId,
      value,
    });
    if (res.status === 401 && mayRetry) {
      this.o.save({ userId: this.o.newUserId(), registered: false });
      return this.attempt(videoId, value, false);
    }
    if (!res.ok) throw new Error(`RYD vote HTTP ${res.status}`);
    const solution = await solvePuzzle((await res.json()) as Puzzle, {
      pause: this.o.pause,
    });
    if (!solution) throw new Error("RYD vote puzzle unsolved");
    const confirm = await this.post("/interact/confirmVote", {
      solution,
      userId: id.userId,
      videoId,
    });
    if (confirm.status === 401 && mayRetry) {
      this.o.save({ userId: this.o.newUserId(), registered: false });
      return this.attempt(videoId, value, false);
    }
    if (!confirm.ok || (await confirm.json()) !== true)
      throw new Error(`RYD vote not confirmed (HTTP ${confirm.status})`);
  }
}
