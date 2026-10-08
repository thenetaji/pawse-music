import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressScale } from "../../components/ui";
import {
  importPlaylist,
  syncYouTubeLibrary,
  useLibrary,
} from "../../data/library";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { Cat, type CatColor } from "../cat/cat";

export default function ImportPage() {
  const insets = useSafeAreaInsets();
  const color = useSetting<CatColor>("catColor", "orange");
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      haptic.success();
    } catch (e) {
      setMsg((e as Error).message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.h1}>Import</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.center}>
        <Cat
          mood={busy ? "chase" : msg ? "happy" : "curious"}
          size={110}
          color={color}
        />
      </View>
      <Text style={styles.label}>Playlist link</Text>
      <View style={styles.field}>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="music.youtube.com/playlist?list=…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          hitSlop={8}
          onPress={async () => setLink(await Clipboard.getStringAsync())}
        >
          <Text style={styles.paste}>Paste</Text>
        </Pressable>
      </View>
      <PressScale
        onPress={() =>
          link.trim() &&
          void run(async () => {
            const id = await importPlaylist(link.trim());
            const p = useLibrary.getState().playlists.find((x) => x.id === id);
            return `Imported ${p?.title ?? "playlist"} · ${p?.tracks.length ?? 0} songs`;
          })
        }
        style={[styles.cta, !link.trim() && { opacity: 0.4 }]}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.ctaText}>Import playlist</Text>
        )}
      </PressScale>
      {signedIn ? (
        <PressScale
          onPress={() =>
            void run(async () => {
              const r = await syncYouTubeLibrary();
              return `Synced ${r.liked} liked songs and ${r.playlists} playlists`;
            })
          }
          style={[styles.cta, styles.ghost]}
        >
          <Text style={[styles.ctaText, { color: "#fff" }]}>
            Sync my YouTube Music library
          </Text>
        </PressScale>
      ) : null}
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", paddingHorizontal: 20 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  center: { alignItems: "center", marginVertical: 26 },
  label: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  input: { flex: 1, color: "#fff", fontSize: 16 },
  paste: { color: "#8B7CFF", fontSize: 15, fontWeight: "700" },
  cta: {
    marginTop: 14,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ghost: { backgroundColor: "rgba(255,255,255,0.12)" },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },
  msg: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    textAlign: "center",
    marginTop: 18,
  },
});
