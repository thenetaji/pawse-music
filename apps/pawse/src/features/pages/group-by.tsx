import { Pressable, StyleSheet, Text, View } from "react-native";

import { CheckGlyph, PlaylistGlyph } from "../../components/glyphs";
import { PressScale } from "../../components/ui";
import { GROUP_BYS, type GroupBy } from "../../data/library-model";
import type { Section } from "../../data/sort-groups";
import type { SortJob } from "../../data/sort-jobs";
import { count } from "../../lib/plural";
import { display } from "../../lib/type";
import { PlayGlyph } from "../now-playing/icons";

const LABELS: Record<GroupBy, string> = {
  mood: "Mood",
  era: "Era",
  language: "Language",
};

export function GroupByBar({
  by,
  accent,
  job,
  incognito,
  onChange,
  onStop,
  onResume,
}: {
  by: GroupBy | undefined;
  accent: string;
  job: SortJob | undefined;
  incognito: boolean;
  onChange: (by: GroupBy | undefined) => void;
  onStop: () => void;
  onResume: () => void;
}) {
  const choices: [GroupBy | undefined, string][] = [
    [undefined, "Off"],
    ...GROUP_BYS.map((g): [GroupBy, string] => [g, LABELS[g]]),
  ];
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.caption}>Group by</Text>
        <View style={styles.segments} accessibilityRole="tablist">
          {choices.map(([id, label]) => {
            const on = id === by;
            return (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => onChange(id)}
                style={[styles.segment, on && { backgroundColor: accent }]}
              >
                <Text
                  style={[styles.segmentText, on && { color: "#000" }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {by ? (
        <Progress
          job={job}
          incognito={incognito}
          onStop={onStop}
          onResume={onResume}
        />
      ) : null}
    </View>
  );
}

function Progress({
  job,
  incognito,
  onStop,
  onResume,
}: {
  job: SortJob | undefined;
  incognito: boolean;
  onStop: () => void;
  onResume: () => void;
}) {
  if (!job || job.state === "done") return null;
  if (job.state === "paused" && incognito)
    return (
      <Text style={styles.note}>
        Incognito is on, so Pawse sorts with what it already knows.
      </Text>
    );
  const working = job.state !== "paused";
  return (
    <View style={styles.progress}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.note}>
          {job.state === "queued"
            ? "Waiting for another list to finish…"
            : `${working ? "Sorting…" : "Paused at"} ${job.done} of ${job.total}`}
        </Text>
        {working ? (
          <Text style={styles.hint}>You can leave; it keeps going.</Text>
        ) : null}
      </View>
      <Pressable hitSlop={8} onPress={working ? onStop : onResume}>
        <Text style={styles.action}>{working ? "Stop" : "Resume"}</Text>
      </Pressable>
    </View>
  );
}

export function SectionHead({
  section,
  saved,
  onPlay,
  onSave,
}: {
  section: Section;
  saved: boolean;
  onPlay: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headTitle} numberOfLines={1}>
          {section.label}
        </Text>
        <Text style={styles.headCount}>
          {count(section.tracks.length, "song")}
        </Text>
      </View>
      <PressScale
        onPress={onSave}
        accessibilityLabel={
          saved ? `Update the ${section.label} playlist` : "Save as playlist"
        }
        style={styles.headBtn}
      >
        {saved ? (
          <CheckGlyph size={18} weight={2.4} color="#fff" />
        ) : (
          <PlaylistGlyph size={18} weight={2.2} color="#fff" />
        )}
      </PressScale>
      <PressScale
        onPress={onPlay}
        accessibilityLabel={`Play ${section.label}, smooth`}
        style={[styles.headBtn, styles.headPlay]}
      >
        <PlayGlyph size={16} color="#000" />
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  caption: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "600",
  },
  segments: {
    flex: 1,
    flexDirection: "row",
    height: 34,
    padding: 3,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  segment: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { color: "#fff", fontSize: 13, ...display("700") },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  note: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  action: { color: "#fff", fontSize: 14, ...display("700") },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 6,
  },
  headTitle: {
    color: "#fff",
    fontSize: 20,
    ...display("800"),
    letterSpacing: -0.3,
  },
  headCount: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headPlay: { backgroundColor: "#fff" },
});
