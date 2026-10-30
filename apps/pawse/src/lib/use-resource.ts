import { kv } from "../data/storage";
import { createAsyncCache } from "./async-cache";

const cache = createAsyncCache<unknown>();
const saved = new Set<string>();
const slot = (key: string) => `res:${key}`;

// Pages marked `keep` show their last good copy at launch and offline, then refresh.
function restore(key: string) {
  if (saved.has(key)) return;
  saved.add(key);
  try {
    const raw = kv.getItem(slot(key));
    if (typeof raw === "string") cache.seed(key, JSON.parse(raw));
  } catch {}
}

// Fetch-and-cache by key; `null` key skips loading.
export function useResource<T>(
  key: string | null,
  load: () => Promise<T>,
  opts?: { keep?: boolean },
) {
  const keep = !!opts?.keep && !!key;
  if (keep) restore(key);
  const loader = keep
    ? () =>
        load().then((d) => {
          void kv.set(slot(key), JSON.stringify(d));
          return d;
        })
    : load;
  return cache.use(key, loader as () => Promise<unknown>) as {
    data?: T;
    error?: Error;
    loading: boolean;
    /** Fetches again, bypassing the cache; settles with the error, if any. */
    reload: () => Promise<Error | undefined>;
  };
}

/** Fetches these pages again, e.g. on pull-to-refresh. */
export const refreshResources = (prefixes: string[], except?: string[]) =>
  cache.refresh(prefixes, except);

/** Whether a refresh result holds an error, however nested. */
export const refreshFailed = (r: unknown): boolean =>
  r instanceof Error || (Array.isArray(r) && r.some(refreshFailed));

/** Drops every cached page and saved copy, e.g. after signing in or out. */
export const clearResources = () => {
  for (const k of saved) kv.removeItem(slot(k));
  saved.clear();
  cache.clear();
};
