import { chainFor, type EqSetting } from "./eq";

/** iPhone plays long songs in pieces that skip the audio tap, so neither the equaliser nor the meter sees them. */
export const bypassesTap = (input: { ios: boolean; onPlaylist: boolean }) =>
  input.ios && input.onPlaylist;

export type EqStatus = { applied: true } | { applied: false; reason: string };

/** Whether the equaliser is changing the sound of the current song, and if not, why. */
export function eqStatus(input: {
  available: boolean;
  eq: EqSetting;
  hasTrack: boolean;
  onPlaylist: boolean;
  ios: boolean;
}): EqStatus {
  const no = (reason: string): EqStatus => ({ applied: false, reason });
  const { eq } = input;
  if (!input.available) return no("This device can't run the equaliser.");
  if (!eq.on) return no("The equaliser is off.");
  const chain = chainFor(eq);
  if (!chain.filters.length && !chain.preamp)
    return no(
      eq.preset === "headphones" && !eq.headphone
        ? "Pick your headphones to apply a correction."
        : "The curve is flat, so nothing changes.",
    );
  if (!input.hasTrack) return no("Nothing is playing.");
  if (bypassesTap(input))
    return no("iPhone can't equalise long songs, which play in pieces.");
  return { applied: true };
}
