// A song's mood for the cat, guessed from words in its title and album and from the playlist or mood
// it was started from. Most songs stay "groove"; only clear signals change the dance.
import type { Track } from "@pawse/music-core";

export type Vibe = "groove" | "hype" | "vibe" | "love" | "sad";

const WORDS: [Exclude<Vibe, "groove">, RegExp][] = [
  [
    "sad",
    /\b(sad|cry(ing)?|tears?|alone|lonely|broken|heartbreak|miss(ing)? you|goodbye|hurts?|pain|dard|tanha(i|ee)?|judaa(i|ee)|bewafa|rona|alvida)\b/,
  ],
  [
    "vibe",
    /\b(lo-?fi|slowed|reverb|chill(ed)?|acoustic|unplugged|sleep|sleepy|rain|piano|ambient|calm|study|focus|jazz|lullaby|instrumental|soft)\b/,
  ],
  [
    "hype",
    /\b(remix|phonk|edm|bass ?boosted|workout|gym|hardstyle|techno|house mix|drill|trap|sped ?up|nightcore|party|club|rave|dance|bhangra|mashup|energy)\b/,
  ],
  [
    "love",
    /\b(love|lover|romantic|romance|valentine|kiss|darling|my heart|pyaa?r|ishq|mohabbat|dil|jaan|prem|sanam|mehbooba)\b/,
  ],
];

// Names of moods and playlists the queue was started from map more reliably than titles.
const SOURCES: [Exclude<Vibe, "groove">, RegExp][] = [
  ["hype", /\b(workout|energi[sz]e|party|gym|pump|run(ning)?|hype)\b/i],
  ["vibe", /\b(chill|relax|sleep|focus|study|calm|lo-?fi|commute)\b/i],
  ["love", /\b(romance|romantic|love)\b/i],
  ["sad", /\b(sad|heartbreak|melanchol)/i],
];

export function songVibe(track?: Track, sourceTitle?: string): Vibe {
  if (!track) return "groove";
  if (sourceTitle)
    for (const [v, re] of SOURCES) if (re.test(sourceTitle)) return v;
  const text = `${track.title} ${track.album?.title ?? ""}`.toLowerCase();
  for (const [v, re] of WORDS) if (re.test(text)) return v;
  return "groove";
}
