import { opusToCaf } from "./caf";
import { opusToMp4 } from "./mp4";
import { samplesOf, validSamples } from "./opus";
import { readWebmOpus } from "./webm";

export type { OpusAudio, OpusHead } from "./opus";
export { opusToCaf, opusToMp4, readWebmOpus };

export type OpusContainer = "mp4" | "caf";

export interface Repackaged {
  bytes: Uint8Array;
  /** File extension and MIME type to save and play it as. */
  ext: "m4a" | "caf";
  mimeType: string;
  durationSec: number;
}

/** WebM/Opus bytes into an MP4 or CAF holding the same packets (nothing is decoded or encoded). Throws when the file isn't plain Opus audio. */
export function repackageOpus(
  webm: Uint8Array,
  container: OpusContainer,
): Repackaged {
  const audio = readWebmOpus(webm);
  const durationSec = validSamples(audio, samplesOf(audio)) / 48_000;
  return container === "mp4"
    ? {
        bytes: opusToMp4(audio),
        ext: "m4a",
        mimeType: 'audio/mp4; codecs="opus"',
        durationSec,
      }
    : {
        bytes: opusToCaf(audio),
        ext: "caf",
        mimeType: 'audio/x-caf; codecs="opus"',
        durationSec,
      };
}
