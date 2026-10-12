import { type PoTokenProvider, WebPoTokenProvider } from "@pawse/innertube";

import { appFetch } from "./net";
import { youtubeSandbox } from "./youtube-sandbox";

/** BotGuard PO tokens minted in the same hidden page as the sig/n solver; undefined where there is no sandbox. */
export const poTokenProvider: PoTokenProvider | undefined =
  youtubeSandbox &&
  new WebPoTokenProvider({ fetch: appFetch, sandbox: youtubeSandbox });

const PREWARM_DELAY_MS = 4000;

/** Starts BotGuard once, shortly after launch, so the first song does not pay the cold mint. */
let warmed = false;
export function prewarmPoToken(): void {
  if (warmed || !poTokenProvider) return;
  warmed = true;
  setTimeout(
    () => void poTokenProvider.visitorData().catch(() => {}),
    PREWARM_DELAY_MS,
  );
}
