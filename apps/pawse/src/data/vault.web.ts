import { kv } from "./storage";

const name = (k: string) => `pawse.vault.${k}`;

export function vaultGet(k: string): string | null {
  const v = kv.getItem(name(k));
  return typeof v === "string" ? v : null;
}

export function vaultSet(k: string, v: string | null): void {
  if (v === null) void kv.removeItem(name(k));
  else void kv.setItem(name(k), v);
}
