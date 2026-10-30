import { findSponsors, parseSponsor, sponsorCandidates } from "./sponsors";

const cue = (start: number, text: string) => ({ start, end: start + 5, text });

const talk = Array.from({ length: 100 }, (_, i) =>
  cue(i * 10, "just ordinary talking about the topic"),
);
const withAd = talk.map((c) =>
  c.start === 300
    ? cue(300, "this video is sponsored by Acme")
    : c.start === 320
      ? cue(320, "use code PAWSE for 20% off")
      : c,
);

test("ordinary talk has no candidates", () => {
  expect(sponsorCandidates(talk)).toEqual([]);
});

test("one stray phrase is not enough", () => {
  expect(
    sponsorCandidates([...talk, cue(2000, "I am partnered with nobody")]),
  ).toEqual([]);
});

test("phrases close together make a candidate window", () => {
  expect(sponsorCandidates(withAd)).toEqual([{ start: 270, end: 370 }]);
});

test("a sponsor reply must be true, plausible and inside the window", () => {
  expect(
    parseSponsor('{"sponsor":true,"start":"5:00","end":"5:40"}', 270, 370),
  ).toEqual({ start: 300, end: 340 });
  expect(parseSponsor('{"sponsor":false}', 270, 370)).toBeNull();
  expect(
    parseSponsor('{"sponsor":true,"start":"5:00","end":"5:02"}', 270, 370),
  ).toBeNull();
  expect(
    parseSponsor('{"sponsor":true,"start":"1:00","end":"1:40"}', 270, 370),
  ).toBeNull();
  expect(parseSponsor("no json", 270, 370)).toBeNull();
});

test("spots come only from confirmed windows", async () => {
  const yes = await findSponsors(
    withAd,
    async () => '{"sponsor":true,"start":"5:00","end":"5:40"}',
  );
  expect(yes).toEqual([{ start: 300, end: 340 }]);
  const no = await findSponsors(withAd, async () => '{"sponsor":false}');
  expect(no).toEqual([]);
  const none = await findSponsors(withAd, async () => null);
  expect(none).toEqual([]);
});
