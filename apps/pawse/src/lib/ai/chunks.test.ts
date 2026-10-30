import {
  chunkCues,
  estimateTokens,
  groupCues,
  packStrings,
  parseStamp,
  stamp,
} from "./chunks";

const cue = (start: number, text: string) => ({ start, end: start + 2, text });

test("stamps round trip", () => {
  expect(stamp(0)).toBe("0:00");
  expect(stamp(754)).toBe("12:34");
  expect(stamp(3723)).toBe("1:02:03");
  expect(parseStamp("12:34")).toBe(754);
  expect(parseStamp("1:02:03")).toBe(3723);
  expect(parseStamp("soon")).toBeUndefined();
  expect(parseStamp("12")).toBeUndefined();
});

test("other scripts cost more tokens than Latin text", () => {
  expect(estimateTokens("hello world")).toBeLessThan(
    estimateTokens("दिल दिल दिल"),
  );
});

test("chunks stay within the budget and keep their time span", () => {
  const cues = Array.from({ length: 60 }, (_, i) =>
    cue(i * 3, "word ".repeat(20).trim()),
  );
  const chunks = chunkCues(cues, 100);
  expect(chunks.length).toBeGreaterThan(3);
  for (const c of chunks)
    expect(estimateTokens(c.text)).toBeLessThanOrEqual(100);
  expect(chunks[0].start).toBe(0);
  expect(chunks.at(-1)?.end).toBe(59 * 3 + 2);
  expect(
    chunks.map((c) => c.text.split("\n").length).reduce((a, b) => a + b),
  ).toBe(60);
});

test("a cue over the limit gets a chunk of its own", () => {
  const chunks = chunkCues(
    [cue(0, "short"), cue(2, "long ".repeat(500)), cue(4, "short")],
    50,
  );
  expect(chunks).toHaveLength(3);
});

test("short cues are merged into lines of about the span", () => {
  const cues = [cue(0, "a"), cue(3, "b"), cue(6, "c"), cue(12, "d")];
  expect(groupCues(cues, 10).map((c) => c.text)).toEqual(["a b c", "d"]);
});

test("strings are packed in order", () => {
  const packed = packStrings(["a ".repeat(400), "b ".repeat(400), "c"], 300);
  expect(packed.length).toBeGreaterThan(1);
  expect(packed.join("")).toContain("c");
});
