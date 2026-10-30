import type { ResolvedStream } from "@pawse/music-core";

import { appFetch } from "./net";

const PROBE_MS = 4000;

export type Probe = "ok" | "refused" | "unreachable";

/** What a ranged request's HTTP status says about a stream: the server answered, said no, or is not working. */
export function probeOf(status: number): Probe {
  if (status === 200 || status === 206) return "ok";
  return status >= 500 ? "unreachable" : "refused";
}

/** Asks the stream's server for its first two bytes, so a refusing URL (403) is told apart from a slow network. */
export async function probeStream(st: ResolvedStream): Promise<Probe> {
  if (!/^https?:/i.test(st.url)) return "ok";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_MS);
  try {
    const res = await appFetch(st.url, {
      headers: { ...st.headers, Range: "bytes=0-1" },
      credentials: "omit",
      signal: ctrl.signal,
    });
    return probeOf(res.status);
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
