// Text other apps send to Pawse through the Android share sheet. Every call is a safe no-op without the module.
import { NativeModule, requireOptionalNativeModule } from "expo";

type Events = { onShare(event: { text: string }): void };

declare class PawseShareNative extends NativeModule<Events> {
  takeInitial(): string | null;
}

const native = requireOptionalNativeModule<PawseShareNative>("PawseShare");

/** What the share that launched the app sent; it is handed out once. */
export const takeInitialShare = () => native?.takeInitial() ?? null;

/** Calls back for each share that arrives while the app is running; returns a stop. */
export function onShare(listener: (text: string) => void): () => void {
  const sub = native?.addListener("onShare", (e) => listener(e.text));
  return () => sub?.remove();
}
