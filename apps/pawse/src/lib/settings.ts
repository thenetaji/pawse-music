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

export type Autoplay = "off" | "songs" | "always";

/** When the queue runs out: stop, similar songs (except after albums and playlists), or similar songs always. */
export function autoplayMode(): Autoplay {
  const s = useLibrary.getState().settings as Record<string, unknown>;
  if (s.autoplay === "off" || s.autoplay === "songs" || s.autoplay === "always")
    return s.autoplay;
  // Older builds kept this as two switches.
  if (s.radioContinue === false) return "off";
  return s.listsContinue ? "always" : "songs";
}

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
