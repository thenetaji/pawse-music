import { canRomanize, romanize } from "./romanize";

test.each([
  ["दिल", "dil"],
  ["प्यार", "pyaar"],
  ["मेरा दिल", "meraa dil"],
  ["हैं", "hain"],
  ["कमल", "kamal"],
  ["समझना", "samajhnaa"],
  ["ज़िंदगी", "zindagee"],
  ["ਪਿਆਰ", "piaar"],
  ["ਅੱਖ", "akkh"],
  ["Hello दिल!", "Hello dil!"],
])("%s reads as %s", (from, to) => {
  expect(romanize(from)).toBe(to);
});

test.each([
  ["한국어", "hangugeo"],
  ["안녕하세요", "annyeonghaseyo"],
  ["사랑해", "saranghae"],
  ["좋아", "joa"],
  ["있어", "isseo"],
  ["같이", "gachi"],
  ["독립", "dongnip"],
  ["신라", "silla"],
  ["설날", "seollal"],
  ["밥", "bap"],
  ["닭", "dak"],
])("%s reads as %s", (from, to) => {
  expect(romanize(from)).toBe(to);
});

test("text with nothing to convert is returned as is", () => {
  expect(canRomanize("hello")).toBe(false);
  expect(romanize("hello")).toBe("hello");
});
