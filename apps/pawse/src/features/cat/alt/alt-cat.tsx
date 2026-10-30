import { lazy, Suspense } from "react";

import type { AltCatKind } from "./cat-kind";
import { LottieCat } from "./lottie-cat";

// The dancing cat is the default, so it loads with the screen; the kitten's sprite sheet stays unread until someone picks it.
const KittenCat = lazy(() =>
  import("./kitten-cat").then((m) => ({ default: m.KittenCat })),
);

export type AltCatProps = {
  kind: AltCatKind;
  size: number;
  playing: boolean;
  /** Just liked: the kitten jumps. */
  liked: boolean;
};

export function AltCat({ kind, size, playing, liked }: AltCatProps) {
  if (kind === "lottie") return <LottieCat size={size} playing={playing} />;
  return (
    <Suspense fallback={null}>
      <KittenCat size={size} playing={playing} liked={liked} />
    </Suspense>
  );
}
