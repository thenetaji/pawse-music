import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { PawseActivity } from "../../modules/pawse-activity";

let dir: Directory | undefined;
function playlistDir(): Directory {
  if (!dir) {
    dir = new Directory(Paths.cache, "hls");
    if (!dir.exists) dir.create({ intermediates: true });
  }
  return dir;
}

/** Puts an HLS playlist where the player can open it: localhost on iOS (AVPlayer won't read playlist files), a cache file elsewhere. */
export async function publishPlaylist(
  name: string,
  text: string,
): Promise<string> {
  if (Platform.OS === "ios") {
    const url = await PawseActivity.servePlaylist(name, text);
    if (!url) throw new Error("playlist server unavailable");
    return url;
  }
  const file = new File(playlistDir(), name);
  file.write(text);
  return file.uri;
}
