import type { StateStorage } from "zustand/middleware";

import { takeLegacy } from "./legacy-key";

const ls = () =>
  typeof localStorage === "undefined" ? undefined : localStorage;
const sync = {
  get: (k: string) => ls()?.getItem(k) ?? null,
  set: (k: string, v: string) => ls()?.setItem(k, v),
  remove: (k: string) => ls()?.removeItem(k),
};

export const kv: StateStorage & {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
} = {
  getItem: (k) => sync.get(k) ?? takeLegacy(k, sync),
  setItem: (k, v) => sync.set(k, v),
  removeItem: (k) => sync.remove(k),
  get: async (k) => sync.get(k) ?? takeLegacy(k, sync),
  set: async (k, v) => sync.set(k, v),
};
