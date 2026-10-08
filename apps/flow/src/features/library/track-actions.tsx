import { artistLine, type Track } from "@studio/music-core";
import { go } from "../../lib/nav";
import { player } from "@studio/player";
import { Share, StyleSheet, Text, View } from "react-native";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { useLibrary } from "../../data/library";

export function showTrackActions(track: Track) {
  const lib = useLibrary.getState();
  const liked = lib.isLiked(track.id);
  const artist = track.artists.find((a) => a.id);
  showSheet({
    header: (
      <View style={s.head}>
        <Artwork thumbnails={track.thumbnails} size={46} radius={7} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {artistLine(track.artists)}
          </Text>
        </View>
      </View>
    ),
    actions: [
      { label: "Play next", onPress: () => player.addNext(track) },
      { label: "Add to queue", onPress: () => player.addToQueue(track) },
      {
        label: "Start radio",
        onPress: () =>
          void player.playRadio({ videoId: track.id, title: track.title }),
      },
      {
        label: liked ? "Remove from liked" : "Like",
        onPress: () => useLibrary.getState().toggleLike(track),
      },
      {
        label: "Add to playlist",
        keepOpen: true,
        onPress: () => showPlaylistPicker(track),
      },
      ...(track.album?.id
        ? [
            {
              label: "Go to album",
              onPress: () => go(`/album/${track.album!.id}`),
            },
          ]
        : []),
      ...(artist?.id
        ? [{ label: "Go to artist", onPress: () => go(`/artist/${artist.id}`) }]
        : []),
      {
        label: "Share",
        onPress: () =>
          void Share.share({
            message: `https://music.youtube.com/watch?v=${track.id}`,
          }),
      },
    ],
  });
}

function showPlaylistPicker(track: Track) {
  const lib = useLibrary.getState();
  showSheet({
    header: (
      <Text style={[s.title, { textAlign: "center" }]}>Add to playlist</Text>
    ),
    actions: [
      {
        label: "New playlist",
        onPress: () => lib.createPlaylist(track.title, [track]),
      },
      ...lib.playlists.map((p) => ({
        label: p.title,
        onPress: () => lib.addToPlaylist(p.id, track),
      })),
    ],
  });
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 1 },
});
