import { View } from "react-native";

import { clearCache, useCached } from "../data/downloads";
import { push } from "../lib/nav";
import { autoDownloadMode } from "../lib/settings";
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
            ["saver", "Low"],
          ]}
        />
        <Toggle k="wifiOnly" label="Only on Wi-Fi" def={false} />
        <Pick
          k="autoDownload"
          label="Download automatically"
          def={autoDownloadMode()}
          options={[
            ["off", "Off"],
            ["liked", "Liked songs"],
            ["all", "Liked and playlist songs"],
          ]}
        />
        <Pick
          k="cacheLimitMb"
          label="Keep played songs offline"
          def={500}
          options={[
            [0, "Off"],
            [250, "Up to 250 MB"],
            [500, "Up to 500 MB"],
            [1000, "Up to 1 GB"],
            [4000, "Up to 4 GB"],
            [8000, "Up to 8 GB"],
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
      <Foot>Played songs make room for new ones when space runs out.</Foot>
    </View>
  );
}

export function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
