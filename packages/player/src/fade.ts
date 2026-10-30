// A quarter sine keeps the total power falling evenly, so the fade doesn't seem to drop off at the end.
export const equalPowerGain = (left: number, total: number): number =>
  total <= 0
    ? 1
    : Math.sin((Math.min(1, Math.max(0, left / total)) * Math.PI) / 2);
