export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const defaultFetch: FetchLike = (input, init) =>
  globalThis.fetch(input, init);

/** Rejects with a TimeoutError after `ms`, aborting the request where the runtime supports it. */
export async function fetchWithTimeout(
  f: FetchLike,
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl =
    typeof AbortController === "function" ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new TimeoutError(`timed out after ${ms}ms: ${url.split("?")[0]}`));
    }, ms);
  });
  try {
    return await Promise.race([
      f(url, { ...init, signal: ctrl?.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export const query = (
  params: Record<string, string | number | undefined>,
): string =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");

/** Parses a Cookie header string into a map. */
export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
