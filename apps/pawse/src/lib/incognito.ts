import { showToast } from "../components/toast";
import { haptic } from "./haptics";
import { getSetting, setSetting, useSetting } from "./settings";

export const useIncognito = () => useSetting("incognito", false);

/** Incognito: plays, videos and searches leave no history, here or on YouTube. */
export function setIncognito(on: boolean) {
  if (on === getSetting("incognito", false)) return;
  haptic.tick();
  setSetting("incognito", on);
  showToast(
    on
      ? "Incognito on: nothing you play, watch or search is saved"
      : "Incognito off",
  );
}
