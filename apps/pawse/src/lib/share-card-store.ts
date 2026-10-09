import type { Track } from "@pawse/music-core";
import { create } from "zustand";

// What the share-card screen should render: a song, optionally with a lyric line.
export const useShareCard = create<{ track?: Track; lyric?: string }>(
  () => ({}),
);
