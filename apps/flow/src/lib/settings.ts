import { useLibrary } from "../data/library";

// Typed-loose settings access with defaults, so screens work while fields are being added.
export function useSetting<T>(key: string, fallback: T): T {
  return useLibrary(
    (s) =>
      ((s.settings as Record<string, unknown>)[key] as T | undefined) ??
      fallback,
  );
}

export function getSetting<T>(key: string, fallback: T): T {
  return (
    ((useLibrary.getState().settings as Record<string, unknown>)[key] as
      | T
      | undefined) ?? fallback
  );
}

export function setSetting(key: string, value: unknown) {
  useLibrary.getState().setSettings({ [key]: value } as never);
}
