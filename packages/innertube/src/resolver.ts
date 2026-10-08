import {
  type ResolvedStream,
  StreamError,
  type StreamResolver,
  type Track,
} from "@studio/music-core";

export interface CreateResolverOptions {
  youtube: StreamResolver;
  saavn?: StreamResolver;
  /** Try JioSaavn first for YouTube tracks of kind 'song'. */
  preferSaavn?: boolean;
}

/** A Track's identity plus `kind`, which decides whether Saavn goes first. */
export type ResolvableTrack = Pick<
  Track,
  "id" | "source" | "title" | "artists" | "durationSec"
> & { kind?: Track["kind"] };

/** YouTube first (or Saavn first for songs when preferred), falling back to the other on any failure. */
export function createResolver({
  youtube,
  saavn,
  preferSaavn = false,
}: CreateResolverOptions): StreamResolver & {
  resolve(track: ResolvableTrack): Promise<ResolvedStream>;
} {
  return {
    async resolve(track: ResolvableTrack): Promise<ResolvedStream> {
      if (track.source === "saavn") {
        if (!saavn)
          throw new StreamError("unplayable", "JioSaavn is not configured");
        return saavn.resolve(track);
      }
      if (track.source !== "youtube")
        throw new StreamError(
          "unplayable",
          `No resolver for ${track.source} tracks`,
        );
      const order = saavn
        ? preferSaavn && track.kind === "song"
          ? [saavn, youtube]
          : [youtube, saavn]
        : [youtube];
      const errors = new Map<StreamResolver, unknown>();
      for (const r of order) {
        try {
          return await r.resolve(track);
        } catch (e) {
          errors.set(r, e);
        }
      }
      // YouTube's reason explains more than a missed Saavn match.
      throw errors.get(youtube);
    },
  };
}
