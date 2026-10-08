import Storage from "expo-sqlite/kv-store";
import type { StateStorage } from "zustand/middleware";

// Native key-value storage (SQLite-backed). Web uses localStorage (storage.web.ts).
// getItem is synchronous so persisted stores hydrate before the first render and the headless player start.
export const kv: StateStorage & {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
} = {
  getItem: (k) => Storage.getItemSync(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
  get: (k) => Storage.getItem(k),
  set: (k, v) => Storage.setItem(k, v),
};
