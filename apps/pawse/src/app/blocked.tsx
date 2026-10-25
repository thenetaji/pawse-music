import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CloseGlyph } from "../components/glyphs";
import { Foot, Section } from "../components/settings-rows";
import { Screen } from "../components/ui";
import {
  type BlockedChannel,
  blockWord,
  unblockChannel,
  unblockWord,
} from "../lib/block";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";
import { useAccent } from "../features/now-playing/now-palette";

/** Channels and title words kept out of Watch, search and Up next. */
export default function Blocked() {
  const accent = useAccent();
  const channels = useSetting<BlockedChannel[]>("blockedChannels", []);
  const words = useSetting<string[]>("blockedWords", []);
  const [text, setText] = useState("");
  const add = () => {
    blockWord(text);
    setText("");
  };
  return (
    <Screen title="Blocked" back bottomInset={60}>
      <Section title="Words">
        <View style={styles.row}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={add}
            placeholder="Add a word or phrase"
            placeholderTextColor="rgba(255,255,255,0.4)"
            returnKeyType="done"
            autoCorrect={false}
            selectionColor={accent}
            style={styles.input}
          />
          {text.trim() ? (
            <Pressable hitSlop={8} onPress={add}>
              <Text style={[styles.action, { color: accent }]}>Add</Text>
            </Pressable>
          ) : null}
        </View>
        {words.map((w) => (
          <View key={w} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {w}
            </Text>
            <Pressable
              hitSlop={10}
              onPress={() => unblockWord(w)}
              accessibilityLabel={`Unblock ${w}`}
              style={styles.x}
            >
              <CloseGlyph
                size={10}
                weight={2.6}
                color="rgba(255,255,255,0.6)"
              />
            </Pressable>
          </View>
        ))}
      </Section>
      <Foot>Videos with any of these in the title stay hidden.</Foot>
      <Section title="Channels">
        {channels.length ? (
          channels.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text style={styles.label} numberOfLines={1}>
                {c.name}
              </Text>
              <Pressable hitSlop={8} onPress={() => unblockChannel(c.id)}>
                <Text style={[styles.action, { color: accent }]}>Unblock</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.row}>
            <Text style={styles.empty}>
              Long-press a video to block its channel.
            </Text>
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  input: { flex: 1, color: "#fff", fontSize: 16, height: 52 },
  label: { flex: 1, color: "#fff", fontSize: 16 },
  empty: { flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 15 },
  action: { fontSize: 15, ...display("700") },
  x: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
});
