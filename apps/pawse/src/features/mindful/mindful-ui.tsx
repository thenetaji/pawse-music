import { StyleSheet, Text, View } from "react-native";

import { Foot, Info, Pick, Section } from "../../components/settings-rows";
import { useClock } from "../../data/recommend";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";
import { formatWatch, lastDays, LIMITS, limitLabel } from "./mindful-core";
import { useMindful, useWatchedToday } from "./mindful-state";

export function MindfulToday() {
  const sec = useWatchedToday();
  const limit = useSetting("mindfulLimit", 0);
  if (!sec && !limit) return null;
  return (
    <Text style={styles.today}>
      Today: {formatWatch(sec)}
      {limit ? ` of ${limitLabel(limit)}` : ""}
    </Text>
  );
}

export function MindfulSettings() {
  const videos = useSetting("videos", true);
  const sec = useWatchedToday();
  if (!videos) return null;
  return (
    <>
      <Section title="Mindful mode">
        <Info label="Today" value={formatWatch(sec)} />
        <Pick
          k="mindfulLimit"
          label="Daily video limit"
          def={0}
          options={LIMITS.map((m): [number, string] => [m, limitLabel(m)])}
        />
      </Section>
      <Foot>
        Counts the time videos play, on this phone only. At the limit videos
        stop and music keeps playing.
      </Foot>
    </>
  );
}

export function VideoWeek() {
  const accent = useAccent();
  const days = useMindful((s) => s.days);
  const { now } = useClock();
  const keys = lastDays(7, now);
  const secs = keys.map((k) => days[k] ?? 0);
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const top = Math.max(...secs);
  return (
    <View>
      <Text style={styles.section}>Video time this week</Text>
      <View style={styles.bars}>
        {keys.map((k, i) => {
          const [y, m, d] = k.split("-").map(Number);
          return (
            <View key={k} style={styles.col}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (secs[i] / top) * 90),
                    backgroundColor:
                      i === keys.length - 1 ? accent : "rgba(255,255,255,0.3)",
                  },
                ]}
              />
              <Text style={styles.day}>
                {new Date(y, m - 1, d).toLocaleDateString(undefined, {
                  weekday: "narrow",
                })}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.total}>{formatWatch(total)} in total</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  today: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    ...display("700"),
    marginHorizontal: 20,
    marginBottom: 8,
  },
  section: {
    color: "#fff",
    fontSize: 22,
    ...display("800"),
    paddingHorizontal: 20,
    marginTop: 30,
    marginBottom: 12,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 20,
    height: 116,
  },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bar: { width: "100%", borderRadius: 6 },
  day: { color: "rgba(255,255,255,0.5)", fontSize: 12, ...display("700") },
  total: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13.5,
    paddingHorizontal: 20,
    marginTop: 10,
  },
});
