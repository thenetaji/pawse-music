// Readable rather than scholarly ("dil", "pyaar", "saranghae"); Japanese and Chinese need dictionaries.

const SCRIPT_TEST = /[ऀ-ൿ가-힣]/;

export const canRomanize = (text: string) => SCRIPT_TEST.test(text);

type Script =
  | "deva"
  | "beng"
  | "guru"
  | "gujr"
  | "orya"
  | "taml"
  | "telu"
  | "knda"
  | "mlym";
const SCRIPTS: Script[] = [
  "deva",
  "beng",
  "guru",
  "gujr",
  "orya",
  "taml",
  "telu",
  "knda",
  "mlym",
];
const SCHWA_DROPS = new Set<Script>(["deva", "guru", "gujr"]);

// All the Brahmic blocks keep the same letters at the same offsets.
const VOWELS: Record<number, string> = {
  0x05: "a",
  0x06: "aa",
  0x07: "i",
  0x08: "ee",
  0x09: "u",
  0x0a: "oo",
  0x0b: "ri",
  0x0c: "li",
  0x0d: "e",
  0x0e: "e",
  0x0f: "e",
  0x10: "ai",
  0x11: "o",
  0x12: "o",
  0x13: "o",
  0x14: "au",
};
const MATRAS: Record<number, string> = {
  0x3e: "aa",
  0x3f: "i",
  0x40: "ee",
  0x41: "u",
  0x42: "oo",
  0x43: "ri",
  0x44: "ree",
  0x45: "e",
  0x46: "e",
  0x47: "e",
  0x48: "ai",
  0x49: "o",
  0x4a: "o",
  0x4b: "o",
  0x4c: "au",
};
const CONSONANTS = [
  "k",
  "kh",
  "g",
  "gh",
  "ng",
  "ch",
  "chh",
  "j",
  "jh",
  "ny",
  "t",
  "th",
  "d",
  "dh",
  "n",
  "t",
  "th",
  "d",
  "dh",
  "n",
  "n",
  "p",
  "ph",
  "b",
  "bh",
  "m",
  "y",
  "r",
  "r",
  "l",
  "l",
  "zh",
  "v",
  "sh",
  "sh",
  "s",
  "h",
];
const NUKTA_FORMS: Record<number, string> = {
  0x58: "q",
  0x59: "kh",
  0x5a: "gh",
  0x5b: "z",
  0x5c: "r",
  0x5d: "rh",
  0x5e: "f",
  0x5f: "y",
};
const NUKTA_OF: [string, string][] = [
  ["kh", "kh"],
  ["dh", "rh"],
  ["ph", "f"],
  ["k", "q"],
  ["g", "gh"],
  ["j", "z"],
  ["d", "r"],
  ["p", "f"],
];
const CHILLU: Record<number, string> = {
  0x7a: "n",
  0x7b: "n",
  0x7c: "r",
  0x7d: "l",
  0x7e: "l",
  0x7f: "k",
};
const LABIALS = new Set([0x2a, 0x2b, 0x2c, 0x2d, 0x2e]);

type Unit = {
  c: string;
  v: string;
  schwa: boolean;
  /** A letter that only carries the vowel written after it (Gurmukhi's ura, aira and iri). */
  bearer?: boolean;
};

function indicWord(chars: number[], script: Script): string {
  const inherent = script === "beng" || script === "orya" ? "o" : "a";
  const units: Unit[] = [];
  let joined = false;
  let double = false;
  const last = () => units[units.length - 1];

  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i];
    const off = (cp - 0x900) & 0x7f;
    if (cp === 0x200c || cp === 0x200d) continue;
    const cons =
      off >= 0x15 && off <= 0x39
        ? CONSONANTS[off - 0x15]
        : (NUKTA_FORMS[off] ?? CHILLU[off]);
    if (cons !== undefined && (off <= 0x39 || off >= 0x58)) {
      const piece = off >= 0x7a ? cons : double ? cons[0] + cons : cons;
      double = false;
      const u = last();
      if (joined && u) {
        u.c += piece;
        u.v = inherent;
        u.schwa = true;
      } else
        units.push({
          c: piece,
          v: off >= 0x7a ? "" : inherent,
          schwa: off < 0x7a,
        });
      joined = false;
      continue;
    }
    joined = false;
    const u = last();
    if (off === 0x4d) {
      if (u) {
        u.v = "";
        u.schwa = false;
        joined = true;
      }
    } else if (off === 0x3c) {
      const hit = u && NUKTA_OF.find(([from]) => u.c.endsWith(from));
      if (u && hit) u.c = u.c.slice(0, -hit[0].length) + hit[1];
    } else if (MATRAS[off]) {
      const v = MATRAS[off];
      if (u && (u.schwa || u.bearer)) {
        u.v = v;
        u.schwa = false;
        u.bearer = false;
      } else units.push({ c: "", v, schwa: false });
    } else if (VOWELS[off]) {
      units.push({
        c: "",
        v: VOWELS[off],
        schwa: false,
        bearer: script === "guru" && off === 0x05,
      });
    } else if (script === "guru" && (off === 0x72 || off === 0x73)) {
      units.push({ c: "", v: "", schwa: false, bearer: true });
    } else if (
      off === 0x01 ||
      off === 0x02 ||
      (script === "guru" && off === 0x70)
    ) {
      const next =
        chars[i + 1] !== undefined ? (chars[i + 1] - 0x900) & 0x7f : 0;
      if (u) {
        u.v += LABIALS.has(next) ? "m" : "n";
        u.schwa = false;
      }
    } else if (off === 0x03) {
      if (u) {
        u.v += "h";
        u.schwa = false;
      }
    } else if (script === "guru" && off === 0x71) double = true;
    else if (off === 0x50) units.push({ c: "om", v: "", schwa: false });
    else if (off >= 0x66 && off <= 0x6f)
      units.push({ c: String(off - 0x66), v: "", schwa: false });
  }

  if (SCHWA_DROPS.has(script) && units.length > 1) {
    for (let i = units.length - 1; i >= 1; i--) {
      const u = units[i];
      if (!u.schwa) continue;
      const end = i === units.length - 1;
      if (end || (/[aeiou]$/.test(units[i - 1].v) && units[i + 1].v !== "")) {
        u.v = "";
        u.schwa = false;
      }
    }
  }
  // "jnya" is said "gya".
  return units
    .map((u) => u.c + u.v)
    .join("")
    .replace(/jny/g, "gy");
}

const LEAD = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
];
const MEDIAL = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const TAIL_SOUND = [
  "",
  "k",
  "k",
  "k",
  "n",
  "n",
  "n",
  "t",
  "l",
  "k",
  "m",
  "l",
  "l",
  "l",
  "p",
  "l",
  "m",
  "p",
  "p",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "t",
];
const SPLIT: Record<number, [number, number]> = {
  3: [1, 9],
  5: [4, 12],
  6: [4, 11],
  9: [8, 0],
  10: [8, 6],
  11: [8, 7],
  12: [8, 9],
  13: [8, 16],
  14: [8, 17],
  15: [8, 11],
  18: [17, 9],
};
const TAIL_TO_LEAD: Record<number, number> = {
  1: 0,
  2: 1,
  4: 2,
  7: 3,
  8: 5,
  16: 6,
  17: 7,
  19: 9,
  20: 10,
  22: 12,
  23: 14,
  24: 15,
  25: 16,
  26: 17,
};
const NASAL_OF: Record<string, string> = { k: "ng", t: "n", p: "m" };

function hangulWord(word: string): string {
  const syl = [...word].map((ch) => {
    const n = ch.charCodeAt(0) - 0xac00;
    return {
      l: Math.floor(n / 588),
      v: Math.floor((n % 588) / 28),
      t: n % 28,
      sound: "",
    };
  });
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i];
    const next = syl[i + 1];
    if (!next) {
      s.sound = TAIL_SOUND[s.t];
      break;
    }
    if (s.t && next.l === 11) {
      if (s.t === 21) s.sound = "ng";
      else if (s.t === 27) s.t = 0;
      else {
        const [stay, move] = SPLIT[s.t] ?? [0, TAIL_TO_LEAD[s.t]];
        s.t = stay;
        next.l =
          next.v === 20 && move === 3
            ? 12
            : next.v === 20 && move === 16
              ? 14
              : move;
      }
      s.sound ||= TAIL_SOUND[s.t];
      continue;
    }
    const soft = s.t === 27 || s.t === 6 || s.t === 15;
    if (soft && [0, 3, 12, 7].includes(next.l)) {
      next.l = ({ 0: 15, 3: 16, 12: 14, 7: 17 } as Record<number, number>)[
        next.l
      ];
      s.t = s.t === 6 ? 4 : s.t === 15 ? 8 : 0;
    } else if (soft && next.l === 9) {
      next.l = 10;
      s.t = s.t === 6 ? 4 : s.t === 15 ? 8 : 0;
    } else if (
      next.l === 18 &&
      TAIL_TO_LEAD[s.t] !== undefined &&
      [1, 7, 17, 22, 19].includes(s.t)
    ) {
      next.l = (
        { 1: 15, 7: 16, 17: 17, 22: 14, 19: 16 } as Record<number, number>
      )[s.t];
      s.t = 0;
    }
    let sound = TAIL_SOUND[s.t];
    if (sound === "l" && next.l === 2) next.l = 5;
    else if (sound === "n" && next.l === 5) {
      sound = "l";
      next.l = 5;
    } else if (["k", "t", "p", "m", "ng"].includes(sound) && next.l === 5)
      next.l = 2;
    if (NASAL_OF[sound] && (next.l === 2 || next.l === 6))
      sound = NASAL_OF[sound];
    s.sound = sound;
  }
  let out = "";
  let afterL = false;
  for (const s of syl) {
    const lead = s.l === 5 && afterL ? "l" : LEAD[s.l];
    out += lead + MEDIAL[s.v] + s.sound;
    afterL = s.sound === "l";
  }
  return out;
}

const classOf = (cp: number) =>
  cp >= 0x900 && cp < 0xd80
    ? "indic"
    : cp >= 0xac00 && cp <= 0xd7a3
      ? "hangul"
      : cp === 0x200c || cp === 0x200d
        ? "joiner"
        : "other";

export function romanize(text: string): string {
  if (!canRomanize(text)) return text;
  let out = "";
  let run: number[] = [];
  let kind: "indic" | "hangul" | undefined;
  const flush = () => {
    if (!run.length || !kind) return;
    out +=
      kind === "hangul"
        ? hangulWord(String.fromCharCode(...run))
        : indicWord(run, SCRIPTS[(run[0] - 0x900) >> 7]);
    run = [];
    kind = undefined;
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const c = classOf(cp);
    if (c === "joiner" && kind === "indic") continue;
    if (cp === 0x964 || cp === 0x965) {
      flush();
      out += ".";
    } else if (c === "indic" || c === "hangul") {
      const block = c === "indic" ? (cp - 0x900) >> 7 : -1;
      if (
        kind &&
        (kind !== c || (c === "indic" && (run[0] - 0x900) >> 7 !== block))
      )
        flush();
      kind = c;
      run.push(cp);
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}
