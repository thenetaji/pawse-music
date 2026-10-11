import { useLibrary } from "../../data/library";
import { desktop } from "../../lib/desktop";

export async function signOut() {
  useLibrary.getState().setSettings({ cookies: null, accountName: null });
  await desktop?.signOut().catch(() => {});
}
