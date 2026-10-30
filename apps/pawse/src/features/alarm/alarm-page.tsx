import type { Track } from "@pawse/music-core";
import * as Application from "expo-application";
import { startActivityAsync } from "expo-intent-launcher";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { PawseAlarm } from "../../../modules/pawse-alarm";
import { Artwork } from "../../components/artwork";
import {
  Foot,
  Link,
  styles as rows,
  Section,
} from "../../components/settings-rows";
import { Chip, PressScale, Screen } from "../../components/ui";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";
import {
  changeAlarm,
  explainAlarm,
  sourceTitle,
  turnOffAlarm,
  turnOnAlarm,
  useAlarm,
  type WakeSource,
} from "./alarm";
import { daysText, timeText, toggleDay, wrap } from "./alarm-core";

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

export default function AlarmPage() {
  const accent = useAccent();
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  const { on, hour, minute, days, source } = useAlarm();
  const [picking, setPicking] = useState(false);

  const report = async (change: Promise<boolean>) => {
    if (!(await change)) explainAlarm("failed");
  };

  if (picking)
    return (
      <Screen title="Wake me with" back bottomInset={60}>
        <SourceList
          current={source}
          onPick={(s) => {
            haptic.tick();
            setPicking(false);
            void report(changeAlarm({ source: s }));
          }}
        />
      </Screen>
    );

  return (
    <Screen title="Wake up to a song" back bottomInset={60}>
      <View style={styles.hero}>
        <Cat mood={on ? "happy" : "sleep"} size={72} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.time}>{timeText(hour, minute)}</Text>
          <Text style={styles.sub}>
            {daysText(days)} · {name} wakes you
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={(v) => {
            haptic.tick();
            if (v) void turnOnAlarm().then(explainAlarm);
            else void turnOffAlarm();
          }}
          trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
          thumbColor="#fff"
        />
      </View>

      <Section title="Time">
        <Stepper
          label="Hour"
          value={new Date(2000, 0, 1, hour).toLocaleTimeString([], {
            hour: "numeric",
          })}
          onStep={(by) => report(changeAlarm({ hour: wrap(hour + by, 24) }))}
        />
        <Stepper
          label="Minute"
          value={String(minute).padStart(2, "0")}
          onStep={(by) =>
            report(changeAlarm({ minute: wrap(minute + by * 5, 60) }))
          }
        />
        <View style={[rows.row, styles.days]}>
          {WEEK.map((d, i) => (
            <Chip
              key={String(i)}
              label={d}
              on={days.includes(i)}
              accent={accent}
              onPress={() => report(changeAlarm({ days: toggleDay(days, i) }))}
            />
          ))}
        </View>
      </Section>
      <Foot>No days chosen rings once, at the next time it comes round.</Foot>

      <Section title="Music">
        <Pressable onPress={() => setPicking(true)} style={rows.row}>
          <Text style={rows.label}>Wake me with</Text>
          <Text style={[rows.value, styles.pickValue]} numberOfLines={1}>
            {sourceTitle(source)}
          </Text>
        </Pressable>
        {Platform.OS === "android" && !PawseAlarm.canUseFullScreen() ? (
          <Link
            label="Let the alarm light up the screen"
            onPress={() =>
              void startActivityAsync(
                "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                { data: `package:${Application.applicationId}` },
              ).catch(() => {})
            }
          />
        ) : null}
      </Section>
      <Foot>
        {Platform.OS === "ios"
          ? `${name} rings with a short chime. Tap Play music on the alarm and Pawse starts your music quietly, then brings the volume up over a minute.`
          : `${name} rings with a short chime. Tap the notification and Pawse starts your music quietly, then brings the volume up over a minute.`}
      </Foot>
    </Screen>
  );
}

function Stepper({
  label,
  value,
  onStep,
}: {
  label: string;
  value: string;
  onStep: (by: 1 | -1) => void;
}) {
  return (
    <View style={rows.row}>
      <Text style={rows.label}>{label}</Text>
      <View style={styles.stepper}>
        <PressScale onPress={() => onStep(-1)} style={styles.step}>
          <Text style={styles.stepText}>−</Text>
        </PressScale>
        <Text style={styles.stepValue}>{value}</Text>
        <PressScale onPress={() => onStep(1)} style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </PressScale>
      </View>
    </View>
  );
}

const same = (a: WakeSource | null, b: WakeSource) =>
  a?.kind === b.kind &&
  (a.kind === "liked" || (b.kind !== "liked" && a.id === b.id));

function SourceList({
  current,
  onPick,
}: {
  current: WakeSource | null;
  onPick: (s: WakeSource) => void;
}) {
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const synced = useLibrary((s) => s.ytPlaylists);
  const history = useLibrary((s) => s.history);
  const seeds = new Map<string, Track>();
  for (const t of [...liked.slice(0, 10), ...history.map((p) => p.track)])
    if (t.kind !== "video" && seeds.size < 14) seeds.set(t.id, t);

  return (
    <>
      <Section title="From your library">
        <SourceRow
          title="Liked songs"
          sub={`${liked.length} songs, shuffled`}
          thumbnails={liked[0]?.thumbnails}
          on={same(current, { kind: "liked" })}
          onPress={() => onPick({ kind: "liked" })}
        />
        {playlists.map((p) => (
          <SourceRow
            key={p.id}
            title={p.title}
            sub={`${p.tracks.length} songs`}
            thumbnails={p.tracks[0]?.thumbnails}
            on={same(current, { kind: "playlist", id: p.id, title: p.title })}
            onPress={() =>
              onPick({ kind: "playlist", id: p.id, title: p.title })
            }
          />
        ))}
        {synced.map((p) => (
          <SourceRow
            key={p.id}
            title={p.title}
            sub="YouTube Music playlist"
            thumbnails={p.thumbnails}
            on={same(current, { kind: "ytplaylist", id: p.id, title: p.title })}
            onPress={() =>
              onPick({ kind: "ytplaylist", id: p.id, title: p.title })
            }
          />
        ))}
      </Section>
      {seeds.size ? (
        <Section title="Radio from a song">
          {[...seeds.values()].map((t) => (
            <SourceRow
              key={t.id}
              title={`${t.title} radio`}
              sub={t.artists[0]?.name ?? ""}
              thumbnails={t.thumbnails}
              on={same(current, { kind: "radio", id: t.id, title: t.title })}
              onPress={() =>
                onPick({ kind: "radio", id: t.id, title: `${t.title} radio` })
              }
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function SourceRow({
  title,
  sub,
  thumbnails,
  on,
  onPress,
}: {
  title: string;
  sub: string;
  thumbnails?: Track["thumbnails"];
  on: boolean;
  onPress: () => void;
}) {
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} style={[rows.row, styles.source]}>
      <Artwork thumbnails={thumbnails} size={40} radius={6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={rows.label} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sourceSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {on ? <Text style={[styles.check, { color: accent }]}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 6,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  time: { color: "#fff", fontSize: 38, ...display("800"), letterSpacing: -1 },
  sub: { color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginTop: 2 },
  days: { justifyContent: "space-between", paddingVertical: 8 },
  pickValue: { flex: 1, textAlign: "right", marginLeft: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  step: {
    width: 40,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stepText: { color: "#fff", fontSize: 22, ...display("700") },
  stepValue: {
    minWidth: 64,
    textAlign: "center",
    color: "#fff",
    fontSize: 17,
    ...display("700"),
  },
  source: { gap: 12, paddingVertical: 8 },
  sourceSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 1 },
  check: { fontSize: 18, ...display("800") },
});
