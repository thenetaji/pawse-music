import type { SearchResults, Track } from "@pawse/music-core";
import { player } from "@pawse/player";
import { router } from "expo-router";
import { AppState } from "react-native";

import { onShare, takeInitialShare } from "../../modules/pawse-share";
import { showToast } from "../components/toast";
import { startEngine, yt } from "./engine";
import { autoplayMode } from "./settings";
import { parseSharedSong, pickMatch, type SharedSong } from "./shared-song";

const tracksIn = (r: SearchResults): Track[] =>
  (r.items ?? r.shelves.flatMap((s) => s.items)).flatMap((i) =>
    i.type === "track" ? [(({ type: _t, ...t }) => t)(i) as Track] : [],
  );

// Regional songs often exist only as a label's video, so videos are asked for when songs have no match.
async function findSong(song: SharedSong): Promise<Track | undefined> {
  const songs = tracksIn(await yt.search(song.query, "songs"));
  return (
    pickMatch(songs, song) ??
    pickMatch(tracksIn(await yt.search(song.query, "videos")), song)
  );
}

const searchFor = (q: string) =>
  router.navigate({ pathname: "/search", params: { q } });

async function openSharedText(text: string) {
  const song = parseSharedSong(text);
  if (!song) {
    showToast("Pawse can only open songs shared from Shazam", { bad: true });
    return;
  }
  showToast(`Looking for ${song.title}`);
  let track: Track | undefined;
  try {
    track = await findSong(song);
  } catch {
    showToast(`Couldn't look up ${song.title}. Check your connection.`, {
      bad: true,
    });
    return;
  }
  if (!track) {
    searchFor(song.query);
    showToast(`Couldn't be sure which one is ${song.title}. Pick it here.`);
    return;
  }
  await startEngine();
  await player.play([track], 0, {
    radio: autoplayMode() !== "off",
    source: { type: "other", title: "From Shazam" },
  });
  showToast(`Playing ${track.title}`, {
    thumbnails: track.thumbnails,
    ms: 8000,
    action: { label: "Wrong song?", onPress: () => searchFor(song.query) },
  });
}

/** Call once at start: plays what Shazam shared, whether that launched Pawse or reached it while running. */
export function startSharedSongs(): () => void {
  const check = () => {
    const text = takeInitialShare();
    if (text) void openSharedText(text);
  };
  check();
  // iOS leaves the share in the App Group, whether or not its extension managed to open Pawse.
  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active") check();
  });
  const stop = onShare((text) => void openSharedText(text));
  return () => {
    foreground.remove();
    stop();
  };
}
