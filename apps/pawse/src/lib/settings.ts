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

const autoplayFrom = (s: Record<string, unknown>): boolean => {
  if (typeof s.autoplayOn === "boolean") return s.autoplayOn;
  // Older builds had a three-way choice, and before that a switch.
  if (s.autoplay === "off" || s.radioContinue === false) return false;
  return true;
};

/** Whether similar songs keep playing when the queue runs out. */
export const autoplayOn = (): boolean =>
  autoplayFrom(useLibrary.getState().settings as Record<string, unknown>);

export const useAutoplayOn = (): boolean =>
  useLibrary((s) => autoplayFrom(s.settings as Record<string, unknown>));

export type AutoDownload = "off" | "liked" | "all";

/** Songs downloaded without asking: none, liked songs, or liked songs and songs added to playlists. */
export function autoDownloadMode(): AutoDownload {
  const s = useLibrary.getState().settings as Record<string, unknown>;
  if (
    s.autoDownload === "off" ||
    s.autoDownload === "liked" ||
    s.autoDownload === "all"
  )
    return s.autoDownload;
  if (s.autoDownloadPlaylists) return "all";
  return s.autoDownloadLiked ? "liked" : "off";
}
