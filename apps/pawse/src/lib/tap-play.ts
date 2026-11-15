import { type PlayOptions, player } from "@pawse/player";
import type { Track } from "@pawse/music-core";

import { autoplayMode, type TapPlay, tapPlayMode } from "./settings";

/**
 * Plays the tapped row of a list as Settings → Playback says: only that song, it and the songs after it, or the
 * whole list. A single song neither starts a radio nor adds similar songs unless Autoplay is on "Always".
 */
export function playTapped(
  list: Track[],
  at: number,
  opts: PlayOptions = {},
  mode: TapPlay = tapPlayMode(),
): void {
  const track = list[at];
  if (!track) return;
  if (mode === "all") return void player.play(list, at, opts);
  if (mode === "rest") return void player.play(list.slice(at), 0, opts);
  void player.play([track], 0, {
    ...opts,
    radio: false,
    endless: autoplayMode() === "always",
  });
}
