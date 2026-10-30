import { Pressable, Text } from "react-native";

import { ChevronRight } from "../../components/glyphs";
import { styles as rows, Section } from "../../components/settings-rows";
import { RIPPLE } from "../../components/ui";
import { push } from "../../lib/nav";
import { alarmSupported, useAlarm } from "./alarm";
import { daysText, timeText } from "./alarm-core";

export function AlarmSettings() {
  const { on, hour, minute, days } = useAlarm();
  if (!alarmSupported()) return null;
  return (
    <Section title="Alarm">
      <Pressable
        onPress={() => push("/alarm")}
        android_ripple={RIPPLE}
        style={rows.row}
      >
        <Text style={rows.label}>Wake up to a song</Text>
        <Text style={rows.value}>
          {on ? `${timeText(hour, minute)}, ${daysText(days)}` : "Off"}
        </Text>
        <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
      </Pressable>
    </Section>
  );
}
