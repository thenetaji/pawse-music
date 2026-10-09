import {
  type AudioQuality,
  type ResolvedStream,
  type ResolveOptions,
  StreamError,
  type StreamResolver,
  type Track,
} from "@pawse/music-core";

export interface CreateResolverOptions {
  youtube: StreamResolver;
  saavn?: StreamResolver;
  /** Try JioSaavn first for YouTube tracks of kind 'song'. */
  preferSaavn?: boolean;
  /** A downloaded copy, checked before any network source unless `remoteOnly`. */
  local?: (id: string) => ResolvedStream | undefined;
  /** Default quality when the call does not pass one. */
  quality?: () => AudioQuality;
}

/** A Track's identity plus `kind`, which decides whether Saavn goes first. */
export type ResolvableTrack = Pick<
  Track,
  "id" | "source" | "title" | "artists" | "durationSec"
> & { kind?: Track["kind"] };

/** Local file first, then YouTube (or Saavn first for songs when preferred), falling back to the other. */
export function createResolver({
  youtube,
  saavn,
  preferSaavn = false,
  local,
  quality,
}: CreateResolverOptions): StreamResolver & {
  resolve(
    track: ResolvableTrack,
    options?: ResolveOptions,
  ): Promise<ResolvedStream>;
} {
  return {
    async resolve(
      track: ResolvableTrack,
      options: ResolveOptions = {},
    ): Promise<ResolvedStream> {
      const excluded = (via: string) => !!options.exclude?.includes(via);
      if (!options.remoteOnly && !excluded("local")) {
        const file = local?.(track.id);
        if (file) return file;
      }
      const o: ResolveOptions = {
        ...options,
        quality: options.quality ?? quality?.(),
      };
      if (track.source === "saavn") {
        if (!saavn)
          throw new StreamError("unplayable", "JioSaavn is not configured");
        return saavn.resolve(track, o);
      }
      if (track.source !== "youtube")
        throw new StreamError(
          "unplayable",
          `No resolver for ${track.source} tracks`,
        );
      // A Saavn stream that failed here goes last, or out when it failed for this track.
      const saavnFirst =
        preferSaavn &&
        track.kind === "song" &&
        !options.avoid?.includes("saavn");
      const order =
        saavn && !excluded("saavn")
          ? saavnFirst
            ? [saavn, youtube]
            : [youtube, saavn]
          : [youtube];
      const errors = new Map<StreamResolver, unknown>();
      for (const r of order) {
        try {
          return await r.resolve(track, o);
        } catch (e) {
          errors.set(r, e);
        }
      }
      // YouTube's reason explains more than a missed Saavn match.
      throw errors.get(youtube);
    },
  };
}
