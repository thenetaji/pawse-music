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

  const inflight = new Map<string, Promise<Error | undefined>>();
  function load(
    key: string,
    loader: () => Promise<T>,
    force = false,
  ): Promise<Error | undefined> {
    loaders.set(key, loader);
    const e = entries.get(key);
    if (e?.loading) return inflight.get(key) ?? Promise.resolve(undefined);
    if (
      !force &&
      e &&
      !e.error &&
      e.data !== undefined &&
      Date.now() - e.at < ttlMs
    )
      return Promise.resolve(undefined);
    entries.set(key, { data: e?.data, loading: true, at: e?.at ?? 0 });
    emit();
    const p: Promise<Error | undefined> = loader().then(
      (data) => {
        entries.set(key, { data, loading: false, at: Date.now() });
        emit();
        return undefined;
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        entries.set(key, {
          data: e?.data,
          error: err,
          loading: false,
          // The old age stays, so a failed refresh doesn't pass for fresh.
          at: e?.at ?? 0,
        });
        emit();
        return err;
      },
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
      reload: (): Promise<Error | undefined> =>
        key ? load(key, loader, true) : Promise.resolve(undefined),
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

  /** Reloads loaded keys starting with one of these prefixes, bar those starting with one of `except`. */
  const refresh = (prefixes: string[], except: string[] = []) =>
    Promise.all(
      [...loaders]
        .filter(
          ([key]) =>
            prefixes.some((p) => key.startsWith(p)) &&
            !except.some((p) => key.startsWith(p)),
        )
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
