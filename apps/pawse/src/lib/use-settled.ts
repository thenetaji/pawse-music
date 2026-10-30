import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * False while a screen is still sliding in, then true: work that isn't needed in the first frames
 * (network, decoding extra images, mounting animated backdrops) waits for it.
 */
export function useSettled(ms = 380): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let task: { cancel: () => void } | undefined;
    const t = setTimeout(() => {
      task = InteractionManager.runAfterInteractions(() => setSettled(true));
    }, ms);
    return () => {
      clearTimeout(t);
      task?.cancel();
    };
  }, [ms]);
  return settled;
}
