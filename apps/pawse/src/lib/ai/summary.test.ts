import type { Bullet } from "./summary";
import { bulletsOf, summarizeTranscript } from "./summary";

const cues = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    start: i * 5,
    end: i * 5 + 4,
    text: "talking about things ".repeat(12),
  }));

const chunk = { start: 60, end: 180, text: "" };

test("a short transcript is summarised in one call", async () => {
  const seen: string[] = [];
  const parts: Bullet[][] = [];
  const made = await summarizeTranscript(
    cues(5),
    async (t) => (seen.push(t), "- [0:05] short"),
    (b) => parts.push(b),
  );
  expect(made).toBe(1);
  expect(seen).toHaveLength(1);
  expect(parts).toEqual([[{ sec: 5, text: "short" }]]);
});

test("a long transcript is summarised in capped parts, each reported as it lands", async () => {
  const progress: number[] = [];
  const seen: string[] = [];
  await summarizeTranscript(
    cues(2000),
    async (t) => (seen.push(t), "- part"),
    (_, done, total) => progress.push(done, total),
  );
  expect(seen).toHaveLength(8);
  expect(progress.slice(0, 2)).toEqual([1, 8]);
  expect(progress.slice(-2)).toEqual([8, 8]);
  expect(seen[0]).toMatch(/^\[0:00\]/);
});

test("parts the model refuses are left out", async () => {
  let n = 0;
  const made = await summarizeTranscript(
    cues(400),
    async () => (n++ % 2 ? null : "- part"),
    () => {},
  );
  expect(made).toBeGreaterThan(0);
});

test("nothing comes back when the model never answers", async () => {
  expect(
    await summarizeTranscript(
      cues(400),
      async () => null,
      () => {},
    ),
  ).toBe(0);
});

describe("bulletsOf", () => {
  it("takes the time each bullet names", () => {
    expect(
      bulletsOf("- [2:10] Plants need light\n- [1:05] Water weekly", chunk),
    ).toEqual([
      { sec: 65, text: "Water weekly" },
      { sec: 130, text: "Plants need light" },
    ]);
  });

  it("uses the start of the part when the time is missing or outside it", () => {
    expect(bulletsOf("- No time here\n- [9:59] Too late", chunk)).toEqual([
      { sec: 60, text: "No time here" },
      { sec: 60, text: "Too late" },
    ]);
  });

  it("accepts brackets after the text and drops intros and markdown", () => {
    expect(
      bulletsOf(
        "Here is a summary:\n- **Soil** matters (1:30)\n1. Mulch [2:00]",
        chunk,
      ),
    ).toEqual([
      { sec: 90, text: "Soil matters" },
      { sec: 120, text: "Mulch" },
    ]);
  });
});
