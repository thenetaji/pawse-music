import type { ResolvedStream, Track } from "@pawse/music-core";
import { currentStream, restream } from "@pawse/player";

import { showToast } from "../components/toast";
import { resolver } from "../data/clients";
import {
  type AudioFormat,
  audioFormat,
  audioFormatLabel,
} from "./audio-format";
import { logEvent } from "./diagnostics";
import { remuxStream } from "./opus-remux";
import { setSetting } from "./settings";

class Unavailable extends Error {}

/** The stream for the current song in `format`, undefined when it is the one already playing. */
async function streamIn(
  track: Track,
  format: AudioFormat,
  quality?: "high",
): Promise<ResolvedStream | undefined> {
  const st = await resolver.resolve(track, quality ? { quality } : undefined);
  if (st.via === "local")
    throw new Unavailable(
      "This song plays from a download, so its format can't change",
    );
  let out = st;
  if (st.opus && format !== "aac" && format !== "saavn") {
    try {
      out = await remuxStream(track, st);
    } catch (e) {
      logEvent("opus-failed", `${track.id}: ${(e as Error)?.message ?? e}`);
      if (format === "opus")
        throw new Unavailable(
          "Opus couldn't be prepared for this song. Still playing what it has",
        );
    }
  }
  const fits =
    format === "best" ||
    (format === "opus" && /opus/i.test(out.mimeType)) ||
    (format === "aac" &&
      out.via.startsWith("youtube:") &&
      /mp4a/i.test(out.mimeType)) ||
    (format === "saavn" && out.via === "saavn");
  if (!fits)
    throw new Unavailable(
      `${audioFormatLabel(format)} isn't available for this song. Still playing what it has`,
    );
  const now = currentStream();
  const same =
    now?.via === out.via &&
    now.mimeType === out.mimeType &&
    now.bitrate === out.bitrate;
  return same ? undefined : out;
}

async function playIn(format: AudioFormat, quality?: "high"): Promise<void> {
  try {
    await restream((t) => streamIn(t, format, quality));
  } catch (e) {
    logEvent("format-failed", (e as Error)?.message ?? String(e));
    showToast(
      e instanceof Unavailable
        ? e.message
        : "Couldn't switch the audio format. Still playing what it has",
      { bad: true },
    );
  }
}

/** Saves the choice for the songs to come, and plays the current song in it from the same position. */
export function chooseFormat(next: AudioFormat): Promise<void> {
  setSetting("audioFormat", next);
  return playIn(next);
}

/** The current song again at High quality, in the chosen format, from the same position. */
export const playInHigh = () => playIn(audioFormat(), "high");
