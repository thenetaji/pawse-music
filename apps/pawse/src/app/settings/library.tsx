import { Alert, Platform, Pressable, Text } from "react-native";

import { showSheet } from "../../components/action-sheet";
import { DownloadOptions } from "../../components/download-options";
import {
  Foot,
  Link,
  styles as rows,
  Section,
} from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import {
  pickBackupFolder,
  runAutoBackup,
  turnOffAutoBackup,
} from "../../data/auto-backup";
import { useLibrary } from "../../data/library";
import { push } from "../../lib/nav";
import { count } from "../../lib/plural";
import { useSetting } from "../../lib/settings";

export default function LibrarySettings() {
  return (
    <Screen title="Library and downloads" back bottomInset={60}>
      {Platform.OS !== "web" ? <DownloadOptions manage /> : null}

      <Section title="Library">
        <Link label="Import music library" onPress={() => push("/import")} />
        <Link
          label="Back up library"
          onPress={() =>
            void import("../../data/backup")
              .then((m) => m.exportLibrary())
              .catch((e: Error) => Alert.alert("Backup failed", e.message))
          }
        />
        {Platform.OS !== "web" ? <AutoBackupRow /> : null}
        <Link
          label="Restore backup"
          onPress={() =>
            void import("../../data/backup")
              .then((m) => m.importLibrary())
              .then(
                (r) =>
                  r &&
                  Alert.alert(
                    "Backup restored",
                    `${count(r.liked, "like")}, ${count(r.playlists, "playlist")}, ${count(Math.max(r.plays, r.journal ?? 0), "play")}`,
                  ),
              )
              .catch((e: Error) => Alert.alert("Restore failed", e.message))
          }
        />
      </Section>
      <BackupNote />
    </Screen>
  );
}

// Daily backup to a folder the user picks; the sheet manages it once it's on.
function AutoBackupRow() {
  const on = !!useSetting<string | null>("backupFolder", null);
  const folder = useSetting<string | null>("backupFolderName", null) ?? "On";
  const at = useSetting("backupAt", 0);
  const pick = () =>
    void pickBackupFolder()
      .then((ok) => ok && runAutoBackup(true))
      .catch((e: Error) => Alert.alert("Backup failed", e.message));
  const onPress = () =>
    on
      ? showSheet({
          actions: [
            {
              label: "Back up now",
              onPress: () => void runAutoBackup(true),
            },
            { label: "Change folder", onPress: pick },
            {
              label: "Turn off",
              destructive: true,
              onPress: turnOffAutoBackup,
            },
          ],
        })
      : pick();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rows.row, pressed && rows.pressed]}
    >
      <Text style={rows.label}>Automatic backup</Text>
      <Text style={[rows.value, { flexShrink: 1 }]} numberOfLines={1}>
        {on ? (at ? `${folder} · ${daysAgo(at)}` : folder) : "Off"} ›
      </Text>
    </Pressable>
  );
}

function daysAgo(at: number): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const n = Math.round((day(Date.now()) - day(at)) / 86_400_000);
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`;
}

// What a backup holds, so it's clear the stats travel with it.
function BackupNote() {
  const liked = useLibrary((s) => s.liked.length);
  const lists = useLibrary((s) => s.playlists.length);
  const plays = useLibrary((s) => s.history.length);
  const error = useSetting<string | null>("backupError", null);
  if (error)
    return (
      <Foot>
        <Text style={{ color: "#FF5A6A" }}>{error}</Text>
      </Foot>
    );
  return (
    <Foot>
      A backup has your {count(liked, "like")}, {count(lists, "playlist")} and{" "}
      {count(plays, "play")}. Deleting the app deletes them.
    </Foot>
  );
}
