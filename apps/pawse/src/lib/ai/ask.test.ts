import { answerParts, excerptsFor } from "./ask";

const cue = (start: number, text: string) => ({ start, end: start + 5, text });

test("excerpts favour the windows that mention the question's words", () => {
  const cues = [
    cue(0, "welcome to the channel today we talk about gardens"),
    cue(60, "the compost heap needs turning every week"),
    cue(120, "and that is why tomatoes love sunshine"),
    cue(180, "thanks for watching see you next time"),
  ];
  const out = excerptsFor("how often should I turn the compost?", cues, 30);
  expect(out).toContain("[1:00]");
  expect(out).not.toContain("[3:00]");
});

test("excerpts keep video order and respect the budget", () => {
  const cues = Array.from({ length: 40 }, (_, i) =>
    cue(i * 40, `compost line ${i} `.repeat(6)),
  );
  const out = excerptsFor("compost", cues, 120);
  const stamps = [...out.matchAll(/\[(\d+):(\d+)\]/g)].map(
    (m) => Number(m[1]) * 60 + Number(m[2]),
  );
  expect(stamps.length).toBeGreaterThan(0);
  expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
  expect(out.length).toBeLessThan(900);
});

test("a question with no matching words still gets excerpts from across the video", () => {
  const cues = Array.from({ length: 30 }, (_, i) =>
    cue(i * 40, `line number ${i}`),
  );
  const out = excerptsFor("what is this about", cues, 200);
  expect(out.split("\n").length).toBeGreaterThan(1);
});

test("timestamps in an answer become seekable parts", () => {
  expect(
    answerParts("He plants them in May [12:34] and waters daily (1:02:03)."),
  ).toEqual([
    { text: "He plants them in May " },
    { text: "12:34", sec: 754 },
    { text: " and waters daily " },
    { text: "1:02:03", sec: 3723 },
    { text: "." },
  ]);
  expect(answerParts("No times here")).toEqual([{ text: "No times here" }]);
});
