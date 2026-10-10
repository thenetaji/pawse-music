// Saved keys were "flow.*" before the app became Pawse; desktop and web installs still hold them.
type Store = {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
};

/** The value saved under the old "flow." name of a "pawse." key, moved to the new key; null when none. */
export function takeLegacy(key: string, store: Store): string | null {
  if (!key.startsWith("pawse.")) return null;
  const old = `flow.${key.slice("pawse.".length)}`;
  const value = store.get(old);
  if (value != null) {
    store.set(key, value);
    store.remove(old);
  }
  return value;
}
