import { player } from "@pawse/player";
import { Platform, Pressable, Text } from "react-native";

import { PawseAudio } from "../../../modules/pawse-audio";
import { showSheet } from "../../components/action-sheet";
import {
  Foot,
  Link,
  Pick,
  styles as rows,
  Section,
  Toggle,
} from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { push } from "../../lib/nav";
import { useAutoQuality } from "../../lib/quality";
import { autoplayMode, setSetting, useSetting } from "../../lib/settings";
import { setSmoothShuffle } from "../../lib/smooth-queue";

export default function PlaybackSettings() {
  return (
    <Screen title="Playback and sound" back bottomInset={60}>
      <Section title="Playback">
        <QualityRow k="quality" label="Quality on Wi-Fi" network="wifi" />
        <QualityRow
          k="qualityCellular"
          label="Quality on mobile data"
          network="cellular"
        />
        <Toggle
          k="bestSource"
          label="Highest quality source"
          hint="320 kbps from JioSaavn when the match is certain, else YouTube"
          def
        />
        <Toggle
          k="normalize"
          label="Same loudness for every song"
          hint="Quiet and loud songs play at the same level"
          def
          onChange={(v) => player.setNormalize(v)}
        />
        <Pick
          k="autoplay"
          label="Autoplay similar songs"
          def={autoplayMode()}
          options={[
            ["off", "Off"],
            ["songs", "Not after albums"],
            ["always", "Always"],
          ]}
        />
        <Toggle
          k="smoothShuffle"
          label="Smooth shuffle"
          hint="Shuffle drifts between similar songs"
          tip="Smooth shuffle is on. Tap Shuffle in the queue to try it"
          def
          write={setSmoothShuffle}
        />
        {Platform.OS !== "web" ? (
          <Toggle
            k="shakeShuffle"
            label="Shake to shuffle"
            hint="Shake the phone to reshuffle what's up next"
            tip="Shake to shuffle is on. Shake the phone while a song plays"
            def={false}
          />
        ) : null}
        <Toggle
          k="resume"
          label="Open on the last song"
          hint="Pawse opens ready on what you played last"
          def
        />
        <Toggle
          k="pauseOnDisconnect"
          label="Pause when headphones disconnect"
          def
        />
        {Platform.OS !== "web" ? (
          <Toggle
            k="resumeAfterInterruption"
            label="Resume after calls and videos"
            def
          />
        ) : null}
        <Pick
          k="sleepFade"
          label="Sleep timer fade-out"
          def={10}
          options={[
            [0, "Off"],
            [5, "5 s"],
            [10, "10 s"],
            [30, "30 s"],
            [60, "1 min"],
          ]}
        />
        <Pick
          k="crossfade"
          label="Crossfade"
          def={0}
          options={[
            [0, "Off"],
            [3, "3 s"],
            [6, "6 s"],
            [9, "9 s"],
            [12, "12 s"],
          ]}
        />
        <Toggle
          k="gapless"
          label="Gapless albums"
          hint="No pause between album tracks"
          def
        />
        {PawseAudio.available ? (
          <>
            <Link label="Equaliser" onPress={() => push("/equaliser")} />
            <Toggle
              k="crossfeed"
              label="Crossfeed for headphones"
              hint="Blends the channels a little, as speakers would"
              tip="Crossfeed is on. Play something on headphones to hear it"
              def={false}
            />
            <Toggle
              k="trimSilence"
              label="Skip silence at song ends"
              hint="Cuts quiet gaps at song ends"
              tip="Silence at song ends is now skipped"
              def
            />
          </>
        ) : null}
        <Toggle
          k="skipNonMusic"
          label="Skip non-music parts"
          hint="Jumps over the talking in music videos"
          def
        />
        {Platform.OS !== "web" ? (
          <Pick
            k="skipSwipe"
            label="Swipe on the cover"
            hint="How a swipe on the cover changes song"
            def="sideways"
            options={[
              ["sideways", "Sideways"],
              ["reels", "Reels"],
            ]}
          />
        ) : null}
      </Section>

      <Foot>
        Automatic picks the quality from your connection. Crossfade fades
        unrelated songs into each other; songs from the same album, long mixes
        and live streams are never crossfaded, and tapping Next cuts quickly.
        Skip non-music parts jumps over the talking in music videos, using
        SponsorBlock. Smooth shuffle plays your songs in an order that moves
        between similar ones instead of jumping at random. Shake to shuffle puts
        the songs still to come in a new order. On the cover, hold and slide up
        or down for the volume, double-tap the sides to go back or forward 10
        seconds, and double-tap the middle to like. Reels swipes up for the next
        song and down for the previous one, and the player then closes by
        pulling down from the top. Crossfeed blends the two channels a little,
        as speakers would, which is easier on headphones.
      </Foot>
    </Screen>
  );
}

const QUALITY_LABEL = { auto: "Automatic", high: "High", saver: "Low" };

// Automatic shows what it is choosing on that network right now.
function QualityRow({
  k,
  label,
  network,
}: {
  k: "quality" | "qualityCellular";
  label: string;
  network: "wifi" | "cellular";
}) {
  const raw = useSetting<string>(k, "auto");
  const value = raw === "saver" || raw === "high" ? raw : "auto";
  const now = useAutoQuality()[network];
  const shown =
    value === "auto"
      ? `Automatic · ${now === "saver" ? "Low" : "High"}`
      : QUALITY_LABEL[value];
  const options: ["auto" | "high" | "saver", string][] = [
    ["auto", "Automatic (recommended)"],
    ["high", "High"],
    ["saver", "Low · saves data"],
  ];
  return (
    <Pressable
      onPress={() =>
        showSheet({
          title: label,
          actions: options.map(([v, l]) => ({
            label: l,
            checked: v === value,
            onPress: () => setSetting(k, v),
          })),
        })
      }
      style={({ pressed }) => [rows.row, pressed && rows.pressed]}
    >
      <Text style={[rows.label, { flex: 1 }]}>{label}</Text>
      <Text style={rows.value}>{shown} ›</Text>
    </Pressable>
  );
}
