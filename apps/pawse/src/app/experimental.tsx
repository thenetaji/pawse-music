import { Foot, Section, Toggle } from "../components/settings-rows";
import { Screen } from "../components/ui";
import { useSetting } from "../lib/settings";

/** Early features to try before they become part of Pawse; each one can change or go away. */
export default function Experimental() {
  const videos = useSetting("videos", true);
  return (
    <Screen title="Experimental" back bottomInset={60}>
      {videos ? (
        <>
          <Section title="Videos">
            <Toggle k="videoInPlayer" label="Song and Video switch" def />
            <Toggle k="showDislikes" label="Show dislikes" def={false} />
          </Section>
          <Foot>
            The Song and Video switch shows a song’s video in the player, in
            time with the music. Dislike counts are estimates from Return
            YouTube Dislike.
          </Foot>
        </>
      ) : null}
      <Section title="Music">
        <Toggle k="skipNonMusic" label="Skip non-music parts" def />
      </Section>
      <Foot>Jumps over the talking in music videos, using SponsorBlock.</Foot>
    </Screen>
  );
}
