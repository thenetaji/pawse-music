import { makeChapters, mergeChapters, parseChapters } from "./chapters";

test("chapters are read from a fenced reply", () => {
  const reply =
    '```json\n[{"at":"5:10","title":"Setting up."},{"at":"7:00","title":"\\"Costs\\""}]\n```';
  expect(parseChapters(reply, 300, 600)).toEqual([
    { startSec: 310, title: "Setting up" },
    { startSec: 420, title: "Costs" },
  ]);
});

test("chapters outside the window or without a title are dropped", () => {
  const reply =
    '[{"at":"1:00","title":"Early"},{"at":"5:10"},{"at":"nonsense","title":"X"},{"at":370,"title":"Number"}]';
  expect(parseChapters(reply, 300, 600)).toEqual([
    { startSec: 370, title: "Number" },
  ]);
});

test("a reply that is not JSON gives no chapters", () => {
  expect(parseChapters("Sure! Here are some chapters", 0, 600)).toEqual([]);
  expect(parseChapters("[{broken", 0, 600)).toEqual([]);
});

test("merged chapters start at zero and are spaced out", () => {
  const out = mergeChapters(
    [
      { startSec: 400, title: "B" },
      { startSec: 30, title: "A" },
      { startSec: 450, title: "Too close" },
      { startSec: 900, title: "C" },
      { startSec: 1300, title: "C" },
      { startSec: 1800, title: "D" },
    ],
    2400,
  );
  expect(out).toEqual([
    { startSec: 0, title: "A" },
    { startSec: 400, title: "B" },
    { startSec: 900, title: "C" },
    { startSec: 1800, title: "D" },
  ]);
});

test("fewer than three chapters are not shown", () => {
  expect(
    mergeChapters(
      [
        { startSec: 0, title: "A" },
        { startSec: 600, title: "B" },
      ],
      1500,
    ),
  ).toEqual([]);
});

test("chapters are made window by window", async () => {
  const cues = Array.from({ length: 400 }, (_, i) => ({
    start: i * 5,
    end: i * 5 + 4,
    text: "some talking here ".repeat(8),
  }));
  const asked: string[] = [];
  const out = await makeChapters(cues, 2000, async (prompt) => {
    asked.push(prompt);
    const first = /^\[(\d+):(\d+)\]/.exec(prompt)!;
    return JSON.stringify([
      { at: `${first[1]}:${first[2]}`, title: `Part ${asked.length}` },
    ]);
  });
  expect(asked.length).toBeGreaterThan(2);
  expect(out[0].startSec).toBe(0);
  expect(out.length).toBeGreaterThanOrEqual(3);
});
