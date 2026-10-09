import { artistLine, type Track } from "@studio/music-core";
import { emitPlayerEvent, player } from "@studio/player";
import { router } from "expo-router";
import { Share, StyleSheet, Text, View } from "react-native";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { download, isDownloaded, removeDownload } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { go, push } from "../../lib/nav";
import { useShareCard } from "../../lib/share-card-store";

export function showTrackActions(
  track: Track,
  opts?: { fromPlayer?: boolean },
) {
  const lib = useLibrary.getState();
  const liked = lib.isLiked(track.id);
  const saved = isDownloaded(track.id);
  const artist = track.artists.find((a) => a.id);
  const leave = (fn: () => void) => () => {
    if (opts?.fromPlayer) router.back();
    setTimeout(fn, opts?.fromPlayer ? 250 : 0);
  };
  haptic.light();
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
      ...(opts?.fromPlayer
        ? []
        : [
            { label: "Play next", onPress: () => player.addNext(track) },
            { label: "Add to queue", onPress: () => player.addToQueue(track) },
          ]),
      {
        label: "Start radio",
        onPress: () =>
          void player.playRadio({ videoId: track.id, title: track.title }),
      },
      {
        label: liked ? "Remove from liked" : "Like",
        onPress: () => {
          if (useLibrary.getState().toggleLike(track))
            emitPlayerEvent("liked", track);
        },
      },
      {
        label: saved ? "Remove download" : "Download",
        onPress: () => (saved ? removeDownload(track.id) : download(track)),
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
              onPress: leave(() => go(`/album/${track.album!.id}`)),
            },
          ]
        : []),
      ...(artist?.id
        ? [
            {
              label: "Go to artist",
              onPress: leave(() => go(`/artist/${artist.id}`)),
            },
          ]
        : []),
      {
        label: "Share card",
        onPress: () => {
          useShareCard.setState({ track, lyric: undefined });
          push("/share-card");
        },
      },
      {
        label: "Share link",
        onPress: () =>
          void Share.share({
            message: `https://music.youtube.com/watch?v=${track.id}`,
          }),
      },
    ],
  });
}

export function shareLyric(track: Track, lyric: string) {
  haptic.medium();
  useShareCard.setState({ track, lyric });
  push("/share-card");
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
