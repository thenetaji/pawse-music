import CookieManager from "@react-native-cookies/cookies";

import { useLibrary } from "../../data/library";

// Forgets Flow's copy of the session and the sign-in browser's own Google cookies.
export async function signOut() {
  useLibrary.getState().setSettings({ cookies: null, accountName: null });
  await CookieManager.clearAll(true).catch(() => {});
}
