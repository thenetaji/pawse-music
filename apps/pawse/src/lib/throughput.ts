// Download speeds seen while songs load (kbit/s). A 128 kbps stream needs about 130; 400 is plainly plenty.
const SLOW_KBPS = 200;
const FAST_KBPS = 400;
const SAMPLES = 4;
const WINDOW_MS = 10_000;
const LOW_FOR_MS = 2 * 60_000;

/**
 * Decides when Automatic quality should step down: only on a measured crawl (several readings below SLOW_KBPS
 * close together), and back up the moment one reading shows the link is fine. A stall with no data says nothing
 * about speed, so it never counts.
 */
export function createSpeedGate() {
  let readings: { at: number; kbps: number }[] = [];
  let lowUntil = 0;
  return {
    /** Adds a reading; true when the gate went low or back to normal because of it. */
    note(kbps: number, now: number): boolean {
      const wasLow = now < lowUntil;
      if (kbps >= FAST_KBPS) {
        readings = [];
        lowUntil = 0;
        return wasLow;
      }
      readings = [
        ...readings.filter((r) => now - r.at < WINDOW_MS),
        { at: now, kbps },
      ].slice(-SAMPLES);
      if (readings.length < SAMPLES) return false;
      const mean = readings.reduce((sum, r) => sum + r.kbps, 0) / SAMPLES;
      if (mean >= SLOW_KBPS) return false;
      readings = [];
      lowUntil = now + LOW_FOR_MS;
      return !wasLow;
    },
    isLow: (now: number) => now < lowUntil,
  };
}
