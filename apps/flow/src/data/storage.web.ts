import type { StateStorage } from "zustand/middleware";

export const kv: StateStorage & {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
} = {
  getItem: (k) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(k),
  setItem: (k, v) =>
    void (typeof localStorage !== "undefined" && localStorage.setItem(k, v)),
  removeItem: (k) =>
    void (typeof localStorage !== "undefined" && localStorage.removeItem(k)),
  get: async (k) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(k),
  set: async (k, v) =>
    void (typeof localStorage !== "undefined" && localStorage.setItem(k, v)),
};
