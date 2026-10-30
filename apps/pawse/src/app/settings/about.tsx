import * as Clipboard from "expo-clipboard";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { showSheet } from "../../components/action-sheet";
import { Link, styles as rows, Section } from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { useAccent } from "../../features/now-playing/now-palette";
import { clearLog, getLogText, useLogCount } from "../../lib/diagnostics";
import { push } from "../../lib/nav";
import { sendDiagnostics } from "../../lib/send-diagnostics";
import { setSetting } from "../../lib/settings";
import {
  checkForUpdate,
  currentVersion,
  installUpdate,
  useUpdate,
} from "../../lib/updates";

export default function AboutSettings() {
  const accent = useAccent();
  return (
    <Screen title="About" back bottomInset={60}>
      <Section title="About">
        <Link label="About Pawse" onPress={() => push("/about")} />
        {Platform.OS !== "web" ? <UpdateRow tint={accent} /> : null}
        <DiagnosticsRow />
        <Link
          label="Show onboarding again"
          onPress={() => {
            setSetting("onboarded", false);
            push("/onboarding");
          }}
        />
      </Section>
    </Screen>
  );
}

// Checks GitHub Releases; Android installs the APK itself, iOS hands the IPA to SideStore.
function UpdateRow({ tint }: { tint: string }) {
  const st = useUpdate();
  const busy = st.kind === "checking" || st.kind === "downloading";
  const label =
    st.kind === "available"
      ? `Update to ${st.update.version}`
      : st.kind === "downloading"
        ? `Downloading ${st.update.version}…`
        : "Check for updates";
  const value =
    st.kind === "checking"
      ? "Checking…"
      : st.kind === "current"
        ? "Up to date"
        : st.kind === "downloading"
          ? `${Math.round(st.progress * 100)}%`
          : st.kind === "error"
            ? "Couldn’t check"
            : currentVersion();
  return (
    <Pressable
      disabled={busy}
      onPress={() =>
        st.kind === "available"
          ? void installUpdate(st.update)
          : void checkForUpdate()
      }
      style={({ pressed }) => [rows.row, pressed && rows.pressed]}
    >
      {st.kind === "downloading" ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              width: `${st.progress * 100}%`,
              backgroundColor: tint,
              opacity: 0.2,
            },
          ]}
        />
      ) : null}
      <Text style={[rows.label, st.kind === "available" && { color: tint }]}>
        {label}
      </Text>
      <Text style={rows.value}>{value}</Text>
    </Pressable>
  );
}

// Shares or copies the playback log so a bug report says what actually happened.
function DiagnosticsRow() {
  const count = useLogCount();
  return (
    <Pressable
      onPress={() =>
        showSheet({
          actions: [
            {
              label: "Send diagnostics",
              onPress: () =>
                void sendDiagnostics().catch((e: Error) =>
                  Alert.alert("Couldn’t share", e.message),
                ),
            },
            {
              label: "Copy diagnostics",
              onPress: () =>
                void Clipboard.setStringAsync(getLogText()).then(() =>
                  Alert.alert(
                    "Copied",
                    "Paste it in a message to the developer.",
                  ),
                ),
            },
            { label: "Clear", destructive: true, onPress: clearLog },
          ],
        })
      }
      style={({ pressed }) => [rows.row, pressed && rows.pressed]}
    >
      <Text style={rows.label}>Diagnostics</Text>
      <Text style={rows.value}>{count} events ›</Text>
    </Pressable>
  );
}
