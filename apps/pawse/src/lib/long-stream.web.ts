import type { ResolvedStream } from "@pawse/music-core";

/** Desktop and web fetch through the relay, which keeps each request small itself. */
export const withPlaylist = async (_id: string, st: ResolvedStream) => st;
