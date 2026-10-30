import { lazy, Suspense } from "react";

import type { AltCatKind } from "./cat-kind";

// Loaded when first shown, so the animation files stay unread until someone picks one of these cats.
const LottieCat = lazy(() =>
  import("./lottie-cat").then((m) => ({ default: m.LottieCat })),
);
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
  return (
    <Suspense fallback={null}>
      {kind === "lottie" ? (
        <LottieCat size={size} playing={playing} />
      ) : (
        <KittenCat size={size} playing={playing} liked={liked} />
      )}
    </Suspense>
  );
}
