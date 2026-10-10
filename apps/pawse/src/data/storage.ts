import Storage from "expo-sqlite/kv-store";
import type { StateStorage } from "zustand/middleware";

import { takeLegacy } from "./legacy-key";

const sync = {
  get: (k: string) => Storage.getItemSync(k),
  set: (k: string, v: string) => Storage.setItemSync(k, v),
  remove: (k: string) => void Storage.removeItemSync(k),
};

// Native key-value storage (SQLite-backed). Web uses localStorage (storage.web.ts).
// getItem is synchronous so persisted stores hydrate before the first render and the headless player start.
export const kv: StateStorage & {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
} = {
  getItem: (k) => sync.get(k) ?? takeLegacy(k, sync),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
  get: async (k) => (await Storage.getItem(k)) ?? takeLegacy(k, sync),
  set: (k, v) => Storage.setItem(k, v),
};
