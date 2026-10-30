// Web and desktop: a Web Audio graph on the player's audio element, built the first time a feature is switched on.
import { type Chain, NO_CHAIN } from "../../src/lib/audio-fx/eq";
import { BAND_HZ, LEVEL_BANDS, type Levels, type PawseAudioApi } from "./types";

export { LEVEL_BANDS, type Levels };

// Half a band either side of the centre.
const EDGE = (BAND_HZ[1] / BAND_HZ[0]) ** 0.5;
const SILENT_DB = -60;
const TYPE = {
  peak: "peaking",
  lowshelf: "lowshelf",
  highshelf: "highshelf",
} as const;

// The player creates its <audio> detached; catching it here avoids patching the library.
const created: HTMLAudioElement[] = [];
if (typeof document !== "undefined") {
  const create = document.createElement.bind(document) as (
    tag: string,
    options?: ElementCreationOptions,
  ) => HTMLElement;
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const el = create(tag, options);
    if (tag.toLowerCase() === "audio") created.push(el as HTMLAudioElement);
    return el;
  }) as typeof document.createElement;
}

interface Graph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  nodes: AudioNode[];
  silentSince: number | null;
}

let graph: Graph | null = null;
let chain: Chain = NO_CHAIN;
let crossfeed = false;
let meter = false;
let retry: ReturnType<typeof setTimeout> | undefined;

const needed = () =>
  chain.filters.length > 0 || chain.preamp !== 0 || crossfeed || meter;

function playerElement(): HTMLAudioElement | null {
  const el = created.find((e) => e.id === "rntp-player");
  if (!el) return null;
  const src = el.currentSrc || el.src;
  // A cross-origin source without CORS headers would go silent behind a media element source.
  if (src && new URL(src, location.href).origin !== location.origin)
    return null;
  return el;
}

function open(): Graph | null {
  if (graph) return graph;
  const el = playerElement();
  const Ctx =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!el || !Ctx) return null;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  const g: Graph = {
    ctx,
    source: ctx.createMediaElementSource(el),
    analyser,
    nodes: [],
    silentSince: null,
  };
  const resume = () => void ctx.resume().catch(() => {});
  el.addEventListener("play", resume);
  for (const ev of ["seeking", "loadstart"])
    el.addEventListener(ev, () => (g.silentSince = null));
  resume();
  return (graph = g);
}

// bs2b: 700 Hz cut, 4.5 dB feed (see the native DSP).
function crossfeedNodes(ctx: AudioContext): {
  input: AudioNode;
  output: AudioNode;
  all: AudioNode[];
} {
  const feed = 4.5;
  const cut = 700;
  const gbLo = (feed * -5) / 6 - 3;
  const gbHi = feed / 6 - 3;
  const gLo = 10 ** (gbLo / 20);
  const gHi = 1 - 10 ** (gbHi / 20);
  const cutHi = cut * 2 ** ((gbLo - 20 * Math.log10(gHi)) / 12);
  const up = ctx.createGain();
  up.channelCount = 2;
  up.channelCountMode = "explicit";
  up.channelInterpretation = "speakers";
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const out = ctx.createGain();
  out.gain.value = 1 / (1 - gHi + gLo);
  up.connect(split);
  const all: AudioNode[] = [up, split, merge, out];
  for (const ch of [0, 1]) {
    const direct = ctx.createBiquadFilter();
    direct.type = "lowshelf";
    direct.frequency.value = cutHi;
    direct.gain.value = gbHi;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = cut;
    lowpass.Q.value = Math.SQRT1_2;
    const level = ctx.createGain();
    level.gain.value = gLo;
    split.connect(direct, ch);
    direct.connect(merge, 0, ch);
    split.connect(lowpass, ch);
    lowpass.connect(level);
    level.connect(merge, 0, 1 - ch);
    all.push(direct, lowpass, level);
  }
  merge.connect(out);
  return { input: up, output: out, all };
}

function wire(g: Graph) {
  g.source.disconnect();
  for (const n of g.nodes) n.disconnect();
  const { ctx } = g;
  const pre = ctx.createGain();
  pre.gain.value = 10 ** (chain.preamp / 20);
  const path: AudioNode[] = [pre];
  for (const f of chain.filters) {
    const node = ctx.createBiquadFilter();
    node.type = TYPE[f.kind];
    node.frequency.value = f.freq;
    node.gain.value = f.gain;
    node.Q.value = f.q;
    path.push(node);
  }
  const nodes = [...path];
  if (crossfeed) {
    const cf = crossfeedNodes(ctx);
    path.push(cf.input, cf.output);
    nodes.push(...cf.all);
  }
  path.push(g.analyser);
  g.nodes = nodes;
  let tail: AudioNode = g.source;
  for (const n of path) {
    tail.connect(n);
    tail = n;
  }
  tail.connect(ctx.destination);
}

function apply() {
  clearTimeout(retry);
  if (!graph && !needed()) return;
  const g = open();
  if (!g) {
    if (needed()) retry = setTimeout(apply, 700);
    return;
  }
  wire(g);
}

const dbOf = (power: number) => 10 * Math.log10(power + 1e-12);

export const PawseAudio: PawseAudioApi = {
  available:
    typeof document !== "undefined" &&
    ("AudioContext" in globalThis || "webkitAudioContext" in globalThis),
  skipsSilence: false,
  setChain(next) {
    chain = next;
    apply();
  },
  setCrossfeed(on) {
    crossfeed = on;
    apply();
  },
  setMeter(on) {
    meter = on;
    apply();
  },
  setSkipSilence() {},
  levels(): Levels | null {
    const g = graph;
    if (!g) return null;
    const { analyser, ctx } = g;
    const wave = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (const v of wave) sum += v * v;
    const db = dbOf(sum / wave.length);
    const now = performance.now();
    if (db < SILENT_DB) g.silentSince ??= now;
    else g.silentSince = null;
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(spectrum);
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    const bands = BAND_HZ.map((hz) => {
      const from = Math.max(1, Math.floor(hz / EDGE / hzPerBin));
      const to = Math.min(
        spectrum.length - 1,
        Math.max(from, Math.ceil((hz * EDGE) / hzPerBin)),
      );
      let power = 0;
      for (let i = from; i <= to; i++) power += 10 ** (spectrum[i] / 10);
      // FFT bins read about 18 dB lower than the native band filters for the same music.
      return dbOf(power / Math.max(1, to - from + 1)) + 18;
    });
    return {
      silentMs: g.silentSince === null ? 0 : now - g.silentSince,
      db,
      bands,
    };
  },
};
