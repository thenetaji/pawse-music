import { originalTitle } from "./oembed";

test("the uploader's title comes from oEmbed, and nothing when YouTube won't say", async () => {
  const ok = jest.fn(
    async () => new Response(JSON.stringify({ title: " Lose 150 Lbs " })),
  );
  expect(await originalTitle("abc", ok)).toBe("Lose 150 Lbs");
  expect(String((ok.mock.calls[0] as unknown[])[0])).toContain(
    "oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc",
  );
  expect(
    await originalTitle("abc", async () => new Response("", { status: 401 })),
  ).toBeUndefined();
});
