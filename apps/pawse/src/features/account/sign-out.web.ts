import { useLibrary } from "../../data/library";

export async function signOut() {
  useLibrary.getState().setSettings({ cookies: null, accountName: null });
}
