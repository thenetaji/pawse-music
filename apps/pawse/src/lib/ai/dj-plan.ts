export type DjPlan = {
  title: string;
  terms: string[];
  yearFrom?: number;
  yearTo?: number;
  energy?: number;
};

export const DJ_CONTEXT =
  `You turn a music request into JSON for a playlist builder. Reply with only JSON like ` +
  `{"title":"Rainy 90s Bollywood","terms":["90s bollywood rain songs","bollywood romantic upbeat 90s"],"yearFrom":1990,"yearTo":1999,"energy":0.7}. ` +
  `terms are 2 to 4 plain YouTube Music search queries. energy runs from 0 (calm) to 1 (loud). ` +
  `Leave out yearFrom, yearTo and energy when the request does not say.`;

const year = (v: unknown) =>
  typeof v === "number" && v >= 1950 && v <= 2030 ? Math.round(v) : undefined;

export function parseDjPlan(reply: string | null, request: string): DjPlan {
  const fallback: DjPlan = {
    title: request.slice(0, 40),
    terms: [request.slice(0, 80)],
  };
  const a = reply?.indexOf("{") ?? -1;
  const b = reply?.lastIndexOf("}") ?? -1;
  if (!reply || a < 0 || b <= a) return fallback;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(a, b + 1));
  } catch {
    return fallback;
  }
  const terms = (Array.isArray(raw.terms) ? raw.terms : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 4);
  if (!terms.length) return fallback;
  let yearFrom = year(raw.yearFrom);
  let yearTo = year(raw.yearTo);
  if (yearFrom && yearTo && yearFrom > yearTo)
    [yearFrom, yearTo] = [yearTo, yearFrom];
  const energy =
    typeof raw.energy === "number" && Number.isFinite(raw.energy)
      ? Math.min(1, Math.max(0, raw.energy))
      : undefined;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 40)
      : fallback.title;
  return { title, terms, yearFrom, yearTo, energy };
}
