import { artistLine, type Track } from "@pawse/music-core";
import { emitPlayerEvent, player } from "@pawse/player";
import { router } from "expo-router";
import { Share, StyleSheet, Text, View } from "react-native";

import { askText, SheetNote, showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { Marquee } from "../../components/marquee";
import {
  AlbumGlyph,
  ArtistGlyph,
  CardGlyph,
  DownloadGlyph,
  HeartIcon,
  InfoGlyph,
  PlaylistGlyph,
  PlayNextGlyph,
  QueueAddGlyph,
  RadioGlyph,
  ShareGlyph,
  ThumbsDown,
  TrashGlyph,
} from "../../components/glyphs";
import { download, isDownloaded, removeDownload } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { removeSong } from "../../lib/remove-song";
import { autoDownloadMode } from "../../lib/settings";
import { useShareCard } from "../../lib/share-card-store";
import { openAlbum, openArtist } from "../../lib/song-links";
import { display } from "../../lib/type";
import { showSongInfo } from "./song-info";

// Menu icons share one size and a lighter stroke than the 18 px glyphs.
const I = 22;
const W = 1.8;

export function showTrackActions(
  track: Track,
  opts?: { fromPlayer?: boolean; removable?: boolean },
) {
  const lib = useLibrary.getState();
  const liked = lib.isLiked(track.id);
  const disliked = lib.isDisliked(track.id);
  const saved = isDownloaded(track.id);
  const leave = (fn: () => void) => {
    if (opts?.fromPlayer) router.back();
    setTimeout(fn, opts?.fromPlayer ? 250 : 0);
  };
  haptic.light();
  showSheet({
    header: (
      <View style={s.head}>
        <Artwork thumbnails={track.thumbnails} size={52} radius={8} />
        <View style={{ flex: 1 }}>
          <Marquee style={s.title}>{track.title}</Marquee>
          <Text style={s.sub} numberOfLines={1}>
            {artistLine(track.artists)}
          </Text>
        </View>
      </View>
    ),
    quick: [
      {
        label: liked ? "Liked" : "Like",
        active: liked,
        icon: (c) => <HeartIcon size={I} weight={W} color={c} filled={liked} />,
        onPress: () => {
          haptic.light();
          if (useLibrary.getState().toggleLike(track))
            emitPlayerEvent("liked", track);
        },
      },
      {
        label: disliked ? "Disliked" : "Dislike",
        active: disliked,
        icon: (c) => (
          <ThumbsDown size={I} weight={W} color={c} filled={disliked} />
        ),
        onPress: () => {
          haptic.light();
          useLibrary.getState().toggleDislike(track);
        },
      },
      {
        label: saved ? "Downloaded" : "Download",
        active: saved,
        keepOpen: saved,
        icon: (c) => (
          <DownloadGlyph size={I} weight={W} color={c} done={saved} />
        ),
        onPress: () => (saved ? confirmRemoveDownload(track) : download(track)),
      },
      {
        label: "Share",
        icon: (c) => <ShareGlyph size={I} weight={W} color={c} />,
        onPress: () =>
          void Share.share({
            message: `https://music.youtube.com/watch?v=${track.id}`,
          }),
      },
    ],
    actions: [
      ...(opts?.fromPlayer
        ? []
        : [
            {
              label: "Play next",
              icon: (c: string) => (
                <PlayNextGlyph size={I} weight={W} color={c} />
              ),
              onPress: () => player.addNext(track),
            },
            {
              label: "Add to queue",
              icon: (c: string) => (
                <QueueAddGlyph size={I} weight={W} color={c} />
              ),
              onPress: () => player.addToQueue(track),
            },
          ]),
      {
        label: "Add to playlist",
        keepOpen: true,
        icon: (c) => <PlaylistGlyph size={I} weight={W} color={c} />,
        onPress: () => showPlaylistPicker(track),
      },
      {
        label: "Start radio",
        icon: (c) => <RadioGlyph size={I} weight={W} color={c} />,
        onPress: () =>
          void player.playRadio({ videoId: track.id, title: track.title }),
      },
      {
        label: "Go to album",
        icon: (c) => <AlbumGlyph size={I} weight={W} color={c} />,
        onPress: () => void openAlbum(track, leave),
      },
      ...(track.artists.length
        ? [
            {
              label:
                track.artists.length > 1 ? "Go to artists" : "Go to artist",
              icon: (c: string) => (
                <ArtistGlyph size={I} weight={W} color={c} />
              ),
              onPress: () => void openArtist(track, leave),
            },
          ]
        : []),
      {
        label: "Song info",
        keepOpen: true,
        icon: (c) => <InfoGlyph size={I} weight={W} color={c} />,
        onPress: () => showSongInfo(track),
      },
      {
        label: "Share card",
        icon: (c) => <CardGlyph size={I} weight={W} color={c} />,
        onPress: () => {
          useShareCard.setState({ track, lyric: undefined });
          push("/share-card");
        },
      },
      ...(opts?.removable
        ? [
            {
              label: "Remove from Home & history",
              destructive: true,
              icon: (c: string) => <TrashGlyph size={I} weight={W} color={c} />,
              onPress: () => removeSong(track),
            },
          ]
        : []),
    ],
  });
}

function confirmRemoveDownload(track: Track) {
  showSheet({
    header: (
      <SheetNote
        title="Remove download?"
        body={`${track.title} will play from the internet again.`}
      />
    ),
    actions: [
      {
        label: "Remove download",
        destructive: true,
        onPress: () => removeDownload(track.id),
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
        keepOpen: true,
        onPress: () =>
          askText({
            title: "New playlist",
            placeholder: "My playlist",
            confirm: "Create",
            onSubmit: (name) => {
              useLibrary.getState().createPlaylist(name, [track]);
              afterAdd(track);
            },
          }),
      },
      ...lib.playlists.map((p) => ({
        label: p.title,
        onPress: () => {
          lib.addToPlaylist(p.id, track);
          afterAdd(track);
        },
      })),
    ],
  });
}

// Settings → Download automatically → Liked and playlist songs.
function afterAdd(track: Track) {
  if (autoDownloadMode() === "all" && !isDownloaded(track.id)) download(track);
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#fff", fontSize: 17, ...display("700") },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 2 },
});
