import { createAsyncCache } from "./async-cache";

const cache = createAsyncCache<unknown>();

// Fetch-and-cache by key; `null` key skips loading.
export function useResource<T>(key: string | null, load: () => Promise<T>) {
  return cache.use(key, load as () => Promise<unknown>) as {
    data?: T;
    error?: Error;
    loading: boolean;
    reload: () => void;
  };
}
