import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

type Entry<T> = { data?: T; error?: Error; loading: boolean; at: number };
const IDLE: Entry<never> = { loading: false, at: 0 };

// A keyed async cache outside React; components subscribe with useSyncExternalStore.
export function createAsyncCache<T>(ttlMs = 10 * 60_000) {
  const entries = new Map<string, Entry<T>>();
  const listeners = new Set<() => void>();
  // The last loader per key, so a refresh can run it again without its component.
  const loaders = new Map<string, () => Promise<T>>();
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => (
    listeners.add(l), () => void listeners.delete(l)
  );

  const inflight = new Map<string, Promise<void>>();
  function load(
    key: string,
    loader: () => Promise<T>,
    force = false,
  ): Promise<void> {
    loaders.set(key, loader);
    const e = entries.get(key);
    if (e?.loading) return inflight.get(key) ?? Promise.resolve();
    if (
      !force &&
      e &&
      !e.error &&
      e.data !== undefined &&
      Date.now() - e.at < ttlMs
    )
      return Promise.resolve();
    entries.set(key, { data: e?.data, loading: true, at: e?.at ?? 0 });
    emit();
    const p = loader().then(
      (data) => (
        entries.set(key, { data, loading: false, at: Date.now() }), emit()
      ),
      (error: Error) => (
        entries.set(key, {
          data: e?.data,
          error,
          loading: false,
          at: Date.now(),
        }),
        emit()
      ),
    );
    inflight.set(key, p);
    return p;
  }

  function use(key: string | null, loader: () => Promise<T>) {
    const entry = useSyncExternalStore(
      subscribe,
      () => (key ? (entries.get(key) ?? IDLE) : IDLE),
      () => IDLE,
    ) as Entry<T>;
    const run = useEffectEvent((k: string, force: boolean) =>
      load(k, loader, force),
    );
    // Also reloads after clear(): the entry drops back to IDLE.
    const missing = entry === IDLE;
    useEffect(() => {
      if (key) run(key, false);
    }, [key, missing]);
    return {
      data: entry.data,
      error: entry.error,
      loading:
        !!key && (entry.loading || (entry.data === undefined && !entry.error)),
      reload: () => (key ? load(key, loader, true) : Promise.resolve()),
    };
  }

  // Shows saved data straight away; it counts as stale, so the first use still refreshes it.
  const seed = (key: string, data: T) => {
    if (!entries.has(key)) entries.set(key, { data, loading: false, at: 0 });
  };

  const clear = () => {
    entries.clear();
    emit();
  };

  /** Reloads every loaded key that starts with one of these, keeping what's shown until the new copy lands. */
  const refresh = (prefixes: string[]) =>
    Promise.all(
      [...loaders]
        .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
        .map(([key, loader]) => load(key, loader, true)),
    );
  return {
    use,
    load,
    clear,
    refresh,
    seed,
    peek: (key: string) => entries.get(key)?.data,
  };
}
