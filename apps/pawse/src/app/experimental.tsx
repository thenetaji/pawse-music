import { Foot, Link, Pick, Section, Toggle } from "../components/settings-rows";
import { Screen } from "../components/ui";
import { useBlockedCount } from "../lib/block";
import { push } from "../lib/nav";
import { useSetting } from "../lib/settings";

/** Early features to try before they become part of Pawse; each one can change or go away. */
export default function Experimental() {
  const yt = useSetting("ytMode", false);
  const blocked = useBlockedCount();
  return (
    <Screen title="Experimental" back bottomInset={60}>
      <Section title="YouTube">
        <Toggle k="ytMode" label="YouTube videos" def={false} />
        {yt ? (
          <>
            <Pick<"auto" | number>
              k="videoPreferred"
              label="Video quality"
              def="auto"
              options={[
                ["auto", "Auto"],
                [1080, "1080p"],
                [720, "720p"],
                [480, "480p"],
                [360, "360p"],
              ]}
            />
            <Toggle k="videoInPlayer" label="Song and Video switch" def />
            <Toggle k="videoAutoplay" label="Play the next video" def={false} />
            <Toggle k="showDislikes" label="Show dislikes" def={false} />
          </>
        ) : null}
      </Section>
      <Foot>
        {yt
          ? "A Watch tab with your subscriptions and search, never Shorts. Auto picks the quality as your connection allows; any video's quality can also be changed while it plays. The Song and Video switch shows a song's video in the player, in time with the music. Dislike counts are estimates from Return YouTube Dislike."
          : "Adds a Watch tab with your subscriptions and search, never Shorts, and videos for your songs."}
      </Foot>

      {yt ? (
        <>
          <Section title="Less noise">
            <Toggle k="skipSponsors" label="Skip sponsors" def />
            <Toggle k="dearrow" label="Honest titles and thumbnails" def />
            <Link
              label={
                blocked ? `Blocked (${blocked})` : "Blocked channels and words"
              }
              onPress={() => push("/blocked")}
            />
          </Section>
          <Foot>
            Sponsor skips come from SponsorBlock, titles and thumbnails from
            DeArrow, both made by their communities.
          </Foot>
        </>
      ) : null}

      <Section title="Music">
        <Toggle k="skipNonMusic" label="Skip non-music parts" def />
        <Pick
          k="homeStyle"
          label="Home"
          def="full"
          options={[
            ["full", "Everything"],
            ["calm", "Calm"],
            ["mine", "Only my music"],
          ]}
        />
      </Section>
      <Foot>
        Skip non-music parts jumps over the talking in music videos
        (SponsorBlock). Calm keeps Home to your music and a few picks, and it
        ends instead of scrolling forever. Only my music shows nothing
        suggested.
      </Foot>
    </Screen>
  );
}
