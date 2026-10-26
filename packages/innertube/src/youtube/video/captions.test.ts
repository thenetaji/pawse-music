import { parseJson3 } from "./captions";

describe("parseJson3", () => {
  it("cleans padding, drops zero-length lines and joins repeats", () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "\u200b hi \u200b" }] },
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "\u200bhi" }] },
        { tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: "hi" }] },
        {
          tStartMs: 1500,
          dDurationMs: 3000,
          segs: [{ utf8: "a " }, { utf8: " b" }],
        },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "\n" }] },
        { tStartMs: 3000, dDurationMs: 1000, segs: [{ utf8: "c" }] },
      ],
    });
    expect(cues).toEqual([
      { start: 0, end: 1.5, text: "hi" },
      { start: 1.5, end: 3, text: "a b" },
      { start: 3, end: 4, text: "c" },
    ]);
  });
});
