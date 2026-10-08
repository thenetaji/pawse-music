// Playback session, imported by index.ts before expo-router. Keep this import graph UI-free (Android headless starts).
import TrackPlayer from "@rntp/player";

import { startEngine } from "./lib/engine";

TrackPlayer.registerPlaybackSession(() => startEngine());
