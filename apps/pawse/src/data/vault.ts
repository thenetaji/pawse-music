import * as SecureStore from "expo-secure-store";

// Small secrets live in the Keychain / Android Keystore, not the plain library store.
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const name = (k: string) => `pawse.vault.${k}`;

export function vaultGet(k: string): string | null {
  try {
    return SecureStore.getItem(name(k), OPTS);
  } catch {
    return null;
  }
}

export function vaultSet(k: string, v: string | null): void {
  try {
    if (v === null)
      void SecureStore.deleteItemAsync(name(k), OPTS).catch(() => {});
    else SecureStore.setItem(name(k), v, OPTS);
  } catch {}
}
