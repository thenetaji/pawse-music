import { Platform } from "react-native";

import { useSetting } from "../../../lib/settings";

/** Who rides the progress bar on Now playing. Mochi is the cat everywhere else, whatever is picked. */
export type CatKind = "mochi" | "lottie" | "kitten";
export type AltCatKind = Exclude<CatKind, "mochi">;

// The animations draw through native modules, so the web build keeps Mochi.
export const altCatsSupported = Platform.OS !== "web";

export const CAT_KINDS: [CatKind, string][] = [
  ["mochi", "Mochi"],
  ...(altCatsSupported
    ? ([
        ["lottie", "Dancing cat"],
        ["kitten", "Pixel kitten"],
      ] as [CatKind, string][])
    : []),
];

export function useCatKind(): CatKind {
  const kind = useSetting<CatKind>("catKind", "mochi");
  return CAT_KINDS.some(([k]) => k === kind) ? kind : "mochi";
}
