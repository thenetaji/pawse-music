import { bestThumbnail } from "@pawse/music-core";
import { getProgress, usePlayerStore } from "@pawse/player";

import { useLibrary } from "../data/library";
import { desktop } from "./desktop";
import { getSetting } from "./settings";

/** Mirrors the playing song to Discord through the desktop app; off by default and never in incognito. */
export function startDiscordStatus(): () => void {
  const send = desktop?.discordActivity;
  if (!send) return () => {};
  const push = () => {
    const s = usePlayerStore.getState();
    const track = s.tracks[s.index];
    if (
      !track ||
      s.status !== "playing" ||
      !getSetting("discordStatus", false) ||
      getSetting("incognito", false)
    )
      return send(null);
    const now = Date.now();
    const at = getProgress().position;
    const length = track.durationSec;
    send({
      title: track.title,
      artist: track.artists.map((a) => a.name).join(", "),
      album: track.album?.title,
      artwork: bestThumbnail(track.thumbnails, 512),
      start: Math.round(now - at * 1000),
      end: length ? Math.round(now + (length - at) * 1000) : undefined,
    });
  };
  const offPlayer = usePlayerStore.subscribe((s, prev) => {
    if (
      s.index !== prev.index ||
      s.status !== prev.status ||
      s.tracks !== prev.tracks
    )
      push();
  });
  const offSettings = useLibrary.subscribe((s, prev) => {
    if (s.settings !== prev.settings) push();
  });
  return () => {
    offPlayer();
    offSettings();
    send(null);
  };
}
