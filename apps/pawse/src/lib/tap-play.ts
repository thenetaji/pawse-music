import { type PlayOptions, player } from "@pawse/player";
import type { Track } from "@pawse/music-core";

/** Plays the tapped song with the songs after it in Up next; what was playing before stays in History. */
export function playTapped(
  list: Track[],
  at: number,
  opts: PlayOptions = {},
): void {
  if (!list[at]) return;
  void player.play(list.slice(at), 0, opts);
}
