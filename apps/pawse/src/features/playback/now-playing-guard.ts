// iPhone only. Video players (the watch page, the muted Video side) rewrite the audio session to
// "mix with others" when they go quiet, and closing the watch page blanks the lock-screen info.
// iOS shows no Dynamic Island or lock-screen player for a mixing app, so while music plays Pawse
// takes the session back and re-sends the song's info.
import { usePlayerStore } from "@pawse/player";
import TrackPlayer from "@rntp/player";
import { AppState, Platform } from "react-native";

import { PawseActivity } from "../../../modules/pawse-activity";
import { useWatch } from "../watch/store";

// expo-video sets the session on its own queue a moment after a player event; claim again after it.
const AFTER_VIDEO_MS = 450;

const playing = () => {
  const s = usePlayerStore.getState().status;
  return s === "playing" || s === "buffering" || s === "loading";
};

function republish() {
  try {
    const i = TrackPlayer.getActiveMediaItemIndex();
    const item = TrackPlayer.getActiveMediaItem();
    if (i == null || !item) return;
    TrackPlayer.updateMetadata(i, { title: item.title, artist: item.artist });
  } catch {}
}

function claim(resend: boolean) {
  if (!playing()) return;
  PawseActivity.claimAudioSession();
  if (resend) republish();
  setTimeout(() => {
    if (!playing()) return;
    PawseActivity.claimAudioSession();
    if (resend) republish();
  }, AFTER_VIDEO_MS);
}

/** For a video surface going away while music plays. */
export const reclaimNowPlaying = () => {
  if (Platform.OS === "ios") claim(true);
};

export function startNowPlayingGuard(): () => void {
  if (Platform.OS !== "ios") return () => {};
  const offPlayer = usePlayerStore.subscribe((s, prev) => {
    if (s.status === "playing" && prev.status !== "playing") claim(false);
  });
  // A video closing or switching releases its player, which clears Now Playing.
  const offWatch = useWatch.subscribe((s, prev) => {
    if (s.player !== prev.player || s.id !== prev.id || s.mode !== prev.mode)
      claim(true);
  });
  // Leaving the app is when the island and lock screen matter.
  const app = AppState.addEventListener("change", (state) => {
    if (state !== "active") claim(true);
  });
  return () => {
    offPlayer();
    offWatch();
    app.remove();
  };
}
