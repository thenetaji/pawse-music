import { showToast } from "../components/toast";
import { kv } from "../data/storage";

const seenKey = (k: string) => `setting-tip:${k}`;

/** Says where to see a setting's effect the first time it is turned on, and never again. */
export function tipOnce(k: string, text: string) {
  void kv.get(seenKey(k)).then((seen) => {
    if (seen) return;
    void kv.set(seenKey(k), "1");
    showToast(text, { ms: 3600 });
  });
}
