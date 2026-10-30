import { AppState } from "react-native";

import { showToast } from "../../components/toast";
import { listeningDigest } from "../../data/journal";
import { push } from "../../lib/nav";
import { getSetting, setSetting } from "../../lib/settings";
import { earnedIds, ITEMS, type MochiStats, mochiStats } from "./mochi-core";

const REFRESH_MS = 5 * 60_000;

export async function refreshMochi(announce = true): Promise<MochiStats> {
  const stats = mochiStats(await listeningDigest(), Date.now());
  const have = getSetting<string[]>("mochiUnlocked", []);
  const fresh = earnedIds(stats).filter((id) => !have.includes(id));
  if (!fresh.length) return stats;
  setSetting("mochiUnlocked", [...have, ...fresh]);
  if (announce) {
    const name = getSetting("catName", "Mochi");
    const one = ITEMS.find((i) => i.id === fresh[0]);
    showToast(
      fresh.length === 1 && one
        ? `${name} unlocked ${one.name}`
        : `${name} unlocked ${fresh.length} new things`,
      { action: { label: "See", onPress: () => push("/mochi") }, ms: 5000 },
    );
  }
  return stats;
}

export function startMochi(): () => void {
  let last = 0;
  const run = () => {
    if (Date.now() - last < REFRESH_MS) return;
    last = Date.now();
    void refreshMochi().catch(() => {});
  };
  const boot = setTimeout(run, 8000);
  const sub = AppState.addEventListener("change", (st) => {
    if (st === "active") run();
  });
  return () => {
    clearTimeout(boot);
    sub.remove();
  };
}
