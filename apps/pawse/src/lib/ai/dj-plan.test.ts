import { parseDjPlan } from "./dj-plan";

test("a good reply becomes a plan", () => {
  const reply =
    '```json\n{"title":"Rainy 90s","terms":["90s bollywood rain"," upbeat 90s hindi "],"yearFrom":1999,"yearTo":1990,"energy":1.4}\n```';
  expect(parseDjPlan(reply, "rainy 90s Bollywood but upbeat")).toEqual({
    title: "Rainy 90s",
    terms: ["90s bollywood rain", "upbeat 90s hindi"],
    yearFrom: 1990,
    yearTo: 1999,
    energy: 1,
  });
});

test("impossible years and extra terms are dropped", () => {
  const plan = parseDjPlan(
    '{"terms":["a","b","c","d","e"],"yearFrom":1800,"yearTo":"never"}',
    "x",
  );
  expect(plan.terms).toEqual(["a", "b", "c", "d"]);
  expect(plan.yearFrom).toBeUndefined();
  expect(plan.yearTo).toBeUndefined();
});

test("a reply that is no use searches for the request itself", () => {
  for (const reply of [null, "I cannot help", "{broken", '{"terms":[]}'])
    expect(parseDjPlan(reply, "sad 2000s rock")).toEqual({
      title: "sad 2000s rock",
      terms: ["sad 2000s rock"],
    });
});
