export type FilterKind = "peak" | "lowshelf" | "highshelf";

export interface Filter {
  kind: FilterKind;
  freq: number;
  gain: number;
  q: number;
}

export interface Coefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// RBJ audio EQ cookbook, normalised by a0; shelves take Q like Equalizer APO's LSC/HSC.
export function coefficients(f: Filter, sampleRate: number): Coefficients {
  const A = 10 ** (f.gain / 40);
  const w = (2 * Math.PI * f.freq) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * f.q);
  const k = 2 * Math.sqrt(A) * alpha;
  let b: [number, number, number];
  let a: [number, number, number];
  if (f.kind === "peak") {
    b = [1 + alpha * A, -2 * cos, 1 - alpha * A];
    a = [1 + alpha / A, -2 * cos, 1 - alpha / A];
  } else if (f.kind === "lowshelf") {
    b = [
      A * (A + 1 - (A - 1) * cos + k),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - k),
    ];
    a = [
      A + 1 + (A - 1) * cos + k,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - k,
    ];
  } else {
    b = [
      A * (A + 1 + (A - 1) * cos + k),
      -2 * A * (A - 1 + (A + 1) * cos),
      A * (A + 1 + (A - 1) * cos - k),
    ];
    a = [
      A + 1 - (A - 1) * cos + k,
      2 * (A - 1 - (A + 1) * cos),
      A + 1 - (A - 1) * cos - k,
    ];
  }
  return {
    b0: b[0] / a[0],
    b1: b[1] / a[0],
    b2: b[2] / a[0],
    a1: a[1] / a[0],
    a2: a[2] / a[0],
  };
}

function magnitude(c: Coefficients, freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const [c1, s1, c2, s2] = [
    Math.cos(w),
    Math.sin(w),
    Math.cos(2 * w),
    Math.sin(2 * w),
  ];
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2;
  const ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2;
  const di = -(c.a1 * s1 + c.a2 * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

export function responseDb(
  filters: Filter[],
  freq: number,
  sampleRate = 48000,
): number {
  let db = 0;
  for (const f of filters)
    db +=
      20 * Math.log10(magnitude(coefficients(f, sampleRate), freq, sampleRate));
  return db;
}

export function peakBoostDb(filters: Filter[], sampleRate = 48000): number {
  let peak = 0;
  for (let i = 0; i <= 120; i++) {
    const freq = 20 * 1000 ** (i / 120);
    peak = Math.max(peak, responseDb(filters, freq, sampleRate));
  }
  return peak;
}
