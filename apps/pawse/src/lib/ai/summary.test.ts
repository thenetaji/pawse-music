import { summarizeTranscript } from "./summary";

const cues = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    start: i * 5,
    end: i * 5 + 4,
    text: "talking about things ".repeat(12),
  }));

test("a short transcript is summarised in one call", async () => {
  const seen: string[] = [];
  const out = await summarizeTranscript(
    cues(5),
    async (t) => (seen.push(t), "- short"),
  );
  expect(out).toBe("- short");
  expect(seen).toHaveLength(1);
});

test("a long transcript is summarised in parts, then together", async () => {
  const seen: string[] = [];
  const progress: number[] = [];
  const out = await summarizeTranscript(
    cues(400),
    async (t) => (seen.push(t), t.startsWith("Notes") ? "- final" : "- part"),
    (done) => progress.push(done),
  );
  expect(out).toBe("- final");
  expect(seen.length).toBeGreaterThan(2);
  expect(seen.at(-1)).toMatch(/^Notes from consecutive parts/);
  expect(progress.at(-1)).toBeGreaterThanOrEqual(progress[0]);
});

test("parts the model refuses are left out", async () => {
  let n = 0;
  const out = await summarizeTranscript(cues(400), async (t) =>
    t.startsWith("Notes") ? "- final" : n++ % 2 ? null : "- part",
  );
  expect(out).toBe("- final");
});

test("nothing comes back when the model never answers", async () => {
  expect(await summarizeTranscript(cues(400), async () => null)).toBeNull();
});
