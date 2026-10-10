import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  BackupError,
  type MergeSummary,
  makeBackup,
  mergeBackup,
  parseBackup,
} from "./backup-format";
import { useLibrary } from "./library";

export { BackupError, type MergeSummary } from "./backup-format";

const MAX_BYTES = 20 << 20;

/** Writes likes, playlists, history, saves and settings (no cookies) to JSON and opens the share sheet. */
export async function exportLibrary(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `pawse-library-${day}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(makeBackup(useLibrary.getState())));
  if (!(await Sharing.isAvailableAsync()))
    throw new BackupError("Sharing is not available on this device");
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Pawse library",
  });
}

/** Picks a backup file, validates it and merges it in; null when the picker was cancelled. */
export async function importLibrary(): Promise<MergeSummary | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > MAX_BYTES)
    throw new BackupError("The file is too large to be a Pawse backup");
  let json: unknown;
  try {
    json = JSON.parse(await new File(asset.uri).text());
  } catch {
    throw new BackupError("The file is not valid JSON");
  }
  const backup = parseBackup(json);
  const { data, added } = mergeBackup(useLibrary.getState(), backup);
  useLibrary.setState(data);
  return added;
}
