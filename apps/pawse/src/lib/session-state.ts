import { create } from "zustand";

// One odd answer proves nothing; this many in a row means YouTube no longer accepts the sign-in.
const SIGNED_OUT_ANSWERS = 3;

let misses = 0;

/** True when cookies were sent but YouTube kept answering as signed out, so the feeds aren't this account's. */
export const useSessionLost = create<boolean>(() => false);

export function noteSessionAnswer(signedIn: boolean) {
  misses = signedIn ? 0 : misses + 1;
  const lost = misses >= SIGNED_OUT_ANSWERS;
  if (lost !== useSessionLost.getState()) useSessionLost.setState(lost, true);
}

export function resetSessionAnswers() {
  misses = 0;
  useSessionLost.setState(false, true);
}
