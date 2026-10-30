import { Foot, Section, Toggle } from "../components/settings-rows";
import { Screen } from "../components/ui";
import { useAiStatus } from "../lib/ai/model";
import { useSetting } from "../lib/settings";

const MODEL = "Apple Intelligence";

export default function Experimental() {
  const videos = useSetting("videos", true);
  const status = useAiStatus();
  return (
    <Screen title="Experimental" back bottomInset={60}>
      {status && status !== "unavailable" ? (
        <>
          {videos ? (
            <>
              <Section title="Videos">
                <Toggle
                  k="aiSummary"
                  label="Summary and Ask this video"
                  def={false}
                />
                <Toggle k="aiChapters" label="Auto chapters" def={false} />
                <Toggle k="aiSponsors" label="Spot sponsors" def={false} />
              </Section>
              <Foot>
                Summary and Ask this video read a video’s captions with {MODEL}{" "}
                on your phone and answer with times you can tap. Auto chapters
                adds chapters, marked AI, to videos over 20 minutes that have
                none; it runs on your phone while you watch. Spot sponsors looks
                for sponsor reads on your phone when SponsorBlock has none, and
                asks before it skips; it never skips by itself.
              </Foot>
            </>
          ) : null}
          <Section title="Music">
            <Toggle k="aiDj" label="AI DJ" def={false} />
          </Section>
          <Foot>
            Describe a mix, like “rainy 90s Bollywood but upbeat”, and {MODEL}{" "}
            on your phone turns it into a search for your mood mix.
          </Foot>
          {status !== "ready" ? (
            <Foot>
              {status === "downloadable"
                ? `${MODEL} downloads once, the first time you use a feature. Auto chapters and Spot sponsors wait until it has.`
                : `${MODEL} is still getting ready. Auto chapters and Spot sponsors start when it is.`}
            </Foot>
          ) : null}
        </>
      ) : status ? (
        <Foot>
          These need Apple Intelligence on an iPhone with iOS 26 or later. This
          phone can’t run them.
        </Foot>
      ) : null}
    </Screen>
  );
}
