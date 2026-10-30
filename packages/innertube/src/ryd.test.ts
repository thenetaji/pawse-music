import { RydVotes, solvePuzzle } from "./ryd";
import { base64Decode, base64Encode } from "./util/bytes";

// requireActual keeps this file free of node type declarations (the package only loads jest types).
const { createHash } = jest.requireActual("node:crypto");

const challenge = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1);

// The extension's own check: SHA-512 of counter (little-endian) + challenge starts with `difficulty` zero bits.
function zeroBits(counterB64: string, difficulty: number) {
  const counter = base64Decode(counterB64);
  const hash: Uint8Array = createHash("sha512")
    .update(Uint8Array.from([...counter, ...challenge]))
    .digest();
  let bits = 0;
  for (const b of hash) {
    if (b === 0) bits += 8;
    else {
      bits += Math.clz32(b) - 24;
      break;
    }
  }
  return bits >= difficulty;
}

test("a solved puzzle really has the leading zero bits", async () => {
  for (const difficulty of [4, 9, 12]) {
    const solution = await solvePuzzle(
      { challenge: base64Encode(challenge), difficulty },
      { pause: async () => {} },
    );
    expect(solution).toBeDefined();
    expect(zeroBits(solution!, difficulty)).toBe(true);
  }
});

test("a vote registers once, then confirms with a solved puzzle", async () => {
  const puzzle = { challenge: base64Encode(challenge), difficulty: 6 };
  const calls: string[] = [];
  let id = { userId: "u".repeat(36), registered: false };
  const fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(
      `${init?.method ?? "GET"} ${url.replace(/^https:\/\/[^/]+/, "")}`,
    );
    if (url.includes("/interact/vote"))
      return new Response(JSON.stringify(puzzle));
    if (url.includes("/puzzle/registration") && init?.method !== "POST")
      return new Response(JSON.stringify(puzzle));
    return new Response("true");
  });
  const ryd = new RydVotes({
    fetch,
    identity: () => id,
    save: (v) => {
      id = v;
    },
    newUserId: () => "n".repeat(36),
    pause: async () => {},
  });
  await ryd.vote("abcdefghijk", 1);
  await ryd.vote("abcdefghijk", 0);
  expect(calls.filter((c) => c.includes("registration")).length).toBe(2); // GET + POST, once
  expect(calls.filter((c) => c.includes("confirmVote")).length).toBe(2);
  expect(id.registered).toBe(true);
});
