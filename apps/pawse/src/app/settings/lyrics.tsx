import { StyleSheet, Text, View } from "react-native";

import { LatinLyricsSettings } from "../../components/addon-settings";
import { Pick, Section, Toggle } from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { useSetting } from "../../lib/settings";

const SIZE = { s: 16, m: 20, l: 25 };

export default function LyricsSettings() {
  const size = useSetting<keyof typeof SIZE>("lyricsSize", "m");
  return (
    <Screen title="Lyrics" back bottomInset={60}>
      <Section title="Lyrics">
        <Toggle
          k="lyricsLine"
          label="Lyric line under the title"
          hint="The line being sung shows under the song title in Now Playing"
          def
        />
        <Pick
          k="lyricsSize"
          label="Text size"
          def="m"
          options={[
            ["s", "Small"],
            ["m", "Medium"],
            ["l", "Large"],
          ]}
        />
        <View style={styles.sample}>
          <Text
            style={[styles.line, { fontSize: SIZE[size] ?? SIZE.m }]}
            numberOfLines={1}
          >
            The line you’re singing along to
          </Text>
        </View>
      </Section>
      <LatinLyricsSettings />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sample: { paddingHorizontal: 16, paddingVertical: 14 },
  line: { color: "#fff", fontWeight: "700" },
});
