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
    reload: () => void;
  };
}

/** Drops every cached page and saved copy, e.g. after signing in or out. */
export const clearResources = () => {
  for (const k of saved) kv.removeItem(slot(k));
  saved.clear();
  cache.clear();
};
