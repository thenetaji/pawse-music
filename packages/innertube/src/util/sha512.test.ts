import { sha512 } from "./sha512";

// requireActual keeps this file free of node type declarations (the package only loads jest types).
const { createHash } = jest.requireActual("node:crypto");
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

test("matches Node's SHA-512 around every padding boundary", () => {
  for (const n of [0, 1, 20, 111, 112, 127, 128, 129, 300]) {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
    expect(hex(sha512(data))).toBe(
      createHash("sha512").update(data).digest("hex"),
    );
  }
});
