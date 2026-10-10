import { View } from "react-native";

import { clearCache, useCached } from "../data/downloads";
import { push } from "../lib/nav";
import { showSheet } from "./action-sheet";
import { Foot, Link, Pick, Section, Toggle } from "./settings-rows";

/** Everything about keeping music on the phone; shown in Settings and on the Downloads page. */
export function DownloadOptions({ manage }: { manage?: boolean }) {
  const kept = useCached();
  return (
    <View style={{ marginTop: 8 }}>
      <Section title="Downloads">
        {manage ? (
          <Link label="Manage downloads" onPress={() => push("/downloads")} />
        ) : null}
        <Pick
          k="downloadQuality"
          label="Download quality"
          def="high"
          options={[
            ["high", "High"],
            ["saver", "Low · smaller files"],
          ]}
        />
        <Toggle k="wifiOnly" label="Download on Wi-Fi only" def={false} />
        <Toggle
          k="autoDownloadLiked"
          label="Download songs I like"
          def={false}
        />
        <Toggle
          k="autoDownloadPlaylists"
          label="Download songs I add to playlists"
          def={false}
        />
      </Section>
      <Section title="Kept offline">
        <Toggle k="autoCache" label="Keep songs I play" def />
        <Pick
          k="cacheLimitMb"
          label="Space for kept songs"
          def={500}
          options={[
            [250, "250 MB"],
            [500, "500 MB"],
            [1000, "1 GB"],
            [4000, "4 GB"],
            [8000, "8 GB"],
          ]}
        />
        <Link
          label={`Clear kept songs (${formatBytes(kept.bytes)})`}
          danger
          onPress={() =>
            showSheet({
              actions: [
                {
                  label: "Clear kept songs",
                  destructive: true,
                  onPress: clearCache,
                },
              ],
            })
          }
        />
      </Section>
      <Foot>
        Kept songs are saved on Wi-Fi only when Data saver is on. Downloads stay
        until you delete them. Downloading a song you already kept moves it over
        instead of downloading it again.
      </Foot>
    </View>
  );
}

export function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
