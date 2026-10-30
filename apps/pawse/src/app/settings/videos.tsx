import { Platform, StyleSheet, Text, View } from "react-native";

import { showSheet } from "../../components/action-sheet";
import { VideoCommunity } from "../../components/addon-settings";
import { ThumbsDown, ThumbsUp } from "../../components/glyphs";
import {
  Foot,
  Link,
  Pick,
  Section,
  Toggle,
} from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { MindfulSettings } from "../../features/mindful/mindful-ui";
import { useBlockedCount } from "../../lib/block";
import { push } from "../../lib/nav";
import { useSetting } from "../../lib/settings";
import { resetRecommendations } from "../../lib/youtube-history";

export default function VideoSettingsPage() {
  return (
    <Screen title="Videos and YouTube" back bottomInset={60}>
      <VideoSettings />
      <VideoCommunity />
      <MindfulSettings />
    </Screen>
  );
}

// Videos and the Home that shows them: on for everyone, one switch for music only.
function VideoSettings() {
  const videos = useSetting("videos", true);
  const blocked = useBlockedCount();
  const focus = useSetting("focusMode", false);
  const higher = useSetting("videoHigher", false);
  const dislikes = useSetting("showDislikes", true);
  return (
    <>
      <Section title="Home and videos">
        <Link
          label={focus ? "Focus mode · On" : "Focus mode"}
          onPress={() => push("/focus")}
        />
        <Link label="Edit Home" onPress={() => push("/edit-home")} />
        <Toggle k="videos" label="YouTube videos" def />
        {videos ? (
          <>
            <Pick<"auto" | number>
              k="videoPreferred"
              label="Video quality"
              def="auto"
              options={[
                ["auto", "Auto"],
                ...(higher && Platform.OS !== "web"
                  ? ([
                      [2160, "4K"],
                      [1440, "1440p"],
                    ] as [number, string][])
                  : []),
                [1080, "1080p"],
                [720, "720p"],
                [480, "480p"],
                [360, "360p"],
              ]}
            />
            {Platform.OS !== "web" ? (
              <Toggle
                k="videoHigher"
                label="Higher qualities (AV1)"
                hint="Adds 1440p and 4K to Video quality"
                def={false}
              />
            ) : null}
            <Toggle k="videoAutoplay" label="Play the next video" def={false} />
            <Toggle
              k="skipSponsors"
              label="Skip sponsors"
              hint="Jumps over sponsor reads and plugs"
              def
            />
            <Toggle
              k="dearrow"
              label="Honest titles and thumbnails"
              hint="Community titles and thumbnails instead of clickbait"
              def
            />
            <Toggle
              k="videoInPlayer"
              label="Song and Video switch"
              hint="Shows a song's video in the player, in time with the music"
              tip="Open Now Playing to switch between Song and Video"
              def
            />
            <Toggle
              k="showDislikes"
              label="Show dislikes"
              tip="Dislikes now show next to the like button on videos"
              def
            />
            {dislikes ? <DislikesSample /> : null}
            <Toggle
              k="learnFromWatching"
              label="Let YouTube learn from what I watch"
              hint="Videos you watch here shape what Home suggests"
              def
            />
            <Link
              label="Reset YouTube recommendations"
              onPress={() =>
                showSheet({
                  actions: [
                    {
                      label: "Reset YouTube recommendations",
                      destructive: true,
                      onPress: resetRecommendations,
                    },
                  ],
                })
              }
            />
            <Link
              label={
                blocked ? `Blocked (${blocked})` : "Blocked channels and words"
              }
              onPress={() => push("/blocked")}
            />
          </>
        ) : null}
      </Section>
      <Foot>
        {videos
          ? "Videos from YouTube in Home, Search and the player, never Shorts. Auto picks the quality as your connection allows. Higher qualities add 1440p and 4K as AV1, which only phones that decode AV1 in hardware (iPhone 15 Pro and newer, recent Android flagships) play smoothly; the rest may stutter and drain the battery. Focus mode leaves out comments, counts, suggestions and autoplay. The Song and Video switch shows a song’s video in the player, in time with the music. Sponsor skips come from SponsorBlock, honest titles from DeArrow, and dislike counts are estimates from Return YouTube Dislike. Signed out, YouTube learns from the videos you watch here, with no account, to suggest more like them; Reset starts it over, and incognito never sends anything."
          : "Pawse shows music only."}
      </Foot>
    </>
  );
}

// How the like and dislike counts will read on a video.
function DislikesSample() {
  return (
    <View style={styles.sampleRow}>
      <View style={styles.pill}>
        <ThumbsUp size={16} color="#fff" />
        <Text style={styles.count}>1.2M</Text>
        <View style={styles.divider} />
        <ThumbsDown size={16} color="#fff" />
        <Text style={styles.count}>18K</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sampleRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  count: { color: "#fff", fontSize: 14, fontWeight: "600" },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
});
