import { HelpCommunity } from "../../components/addon-settings";
import { showSheet } from "../../components/action-sheet";
import {
  Foot,
  Link,
  Pick,
  Section,
  Toggle,
} from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { useLibrary } from "../../data/library";
import {
  LANGUAGES,
  languageCode,
  languageName,
  REGIONS,
  regionCode,
  regionName,
} from "../../lib/locale";

export default function PrivacySettings() {
  return (
    <Screen title="Privacy" back bottomInset={60}>
      <Section title="Privacy">
        <Toggle k="incognito" label="Incognito" def={false} />
        <Toggle
          k="pauseHistory"
          label="Pause listening history"
          hint="New plays are not added to your history"
          def={false}
        />
        <Link
          label="Clear search history"
          onPress={() => useLibrary.getState().clearSearches()}
        />
        <Link
          label="Clear listening history"
          danger
          onPress={() =>
            showSheet({
              actions: [
                {
                  label: "Clear listening history",
                  destructive: true,
                  onPress: () => {
                    useLibrary.setState({ history: [] });
                    void import("../../data/journal").then((m) =>
                      m.clearJournal(),
                    );
                  },
                },
              ],
            })
          }
        />
      </Section>
      <Foot>
        Incognito keeps nothing you play, watch or search: no history, no
        Continue, nothing learned for recommendations, and nothing sent to
        YouTube&apos;s history. Turn it on or off by holding the Settings button
        on Home.
      </Foot>

      <Section title="Content">
        <Pick
          k="region"
          label="Region"
          def="auto"
          options={[
            ["auto", `Automatic (${regionName(regionCode("auto"))})`],
            ["ZZ", "Worldwide"],
            ...REGIONS,
          ]}
        />
        <Pick
          k="language"
          label="Feed language"
          def="auto"
          options={[
            ["auto", `Automatic (${languageName(languageCode("auto"))})`],
            ...LANGUAGES,
          ]}
        />
        <Toggle
          k="explicitFilter"
          label="Hide explicit songs"
          tip="Explicit songs are now hidden in feeds and search"
          def={false}
        />
      </Section>

      <HelpCommunity />
    </Screen>
  );
}
