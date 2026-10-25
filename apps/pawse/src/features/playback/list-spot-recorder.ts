// Remembers the song you're on in a playlist or album, for its Resume button.
import { usePlayerStore } from "@pawse/player";

import { recordSpot } from "../../data/list-spots";

export function startListSpotRecorder(): () => void {
  return usePlayerStore.subscribe((s, prev) => {
    const t = s.tracks[s.index];
    if (!t || !s.source?.id) return;
    if (t.id === prev.tracks[prev.index]?.id && s.source === prev.source) return;
    const kind = s.source.type;
    if (kind !== "playlist" && kind !== "album" && kind !== "library") return;
    recordSpot(s.source.id, t.id, t.title);
  });
}
