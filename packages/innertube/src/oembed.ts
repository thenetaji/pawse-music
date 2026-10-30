import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";

// Unlike its pages and API, YouTube's oEmbed answer is never translated.
export async function originalTitle(
  id: string,
  f: FetchLike = defaultFetch,
): Promise<string | undefined> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const res = await fetchWithTimeout(f, url, { credentials: "omit" }, 8000);
  if (!res.ok) return undefined;
  const data = (await res.json().catch(() => undefined)) as
    | { title?: unknown }
    | undefined;
  return typeof data?.title === "string" && data.title.trim()
    ? data.title.trim()
    : undefined;
}
