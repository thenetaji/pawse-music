export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const defaultFetch: FetchLike = (input, init) =>
  globalThis.fetch(input, init);

/** Rejects with a TimeoutError after `ms`, aborting the request where the runtime supports it; honours `init.signal`. */
export async function fetchWithTimeout(
  f: FetchLike,
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const outer = init.signal ?? undefined;
  if (outer?.aborted) throw abortError();
  const ctrl =
    typeof AbortController === "function" ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new TimeoutError(`timed out after ${ms}ms: ${url.split("?")[0]}`));
    }, ms);
    if (outer) {
      onAbort = () => {
        ctrl?.abort();
        reject(abortError());
      };
      outer.addEventListener("abort", onAbort);
    }
  });
  try {
    return await Promise.race([
      f(url, { ...init, signal: ctrl?.signal ?? outer }),
      guard,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) outer?.removeEventListener("abort", onAbort);
  }
}

const RETRY_BACKOFF_MS = 600;
const retryableStatus = (status: number) => status === 429 || status >= 500;

/** fetchWithTimeout with `retries` extra attempts on network errors, timeouts, 5xx and 429. Idempotent requests only. */
export async function fetchWithRetry(
  f: FetchLike,
  url: string,
  init: RequestInit,
  ms: number,
  retries = 1,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= retries;
    try {
      const res = await fetchWithTimeout(f, url, init, ms);
      if (last || !retryableStatus(res.status)) return res;
    } catch (e) {
      if (last || init.signal?.aborted) throw e;
    }
    await sleep(RETRY_BACKOFF_MS * (attempt + 1), init.signal ?? undefined);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort);
  });
}

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
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
