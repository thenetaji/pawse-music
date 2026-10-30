// Changes to a YouTube playlist the account owns, with a toast for the outcome.
import type { PlaylistPrivacy } from "@pawse/innertube";

import { showToast } from "../components/toast";
import {
  deleteYouTubePlaylist,
  describeYouTubePlaylist,
  renameYouTubePlaylist,
  setYouTubePlaylistPrivacy,
} from "../data/account";
import { isPinned, unpin } from "../data/pins";
import { haptic } from "./haptics";

export const PRIVACY_CHOICES: {
  value: PlaylistPrivacy;
  label: string;
  sub: string;
}[] = [
  { value: "PUBLIC", label: "Public", sub: "Anyone can find and play it" },
  { value: "UNLISTED", label: "Unlisted", sub: "Anyone with the link" },
  { value: "PRIVATE", label: "Private", sub: "Only you" },
];

export type PlaylistActions = {
  onRename: (name: string) => void;
  onDescribe: (description: string) => void;
  onPrivacy: (privacy: PlaylistPrivacy) => void;
  onDelete: () => void;
};

function refused(what: string) {
  haptic.error();
  showToast(`YouTube didn't ${what}. Try again later.`, { bad: true });
}

/** The edits for one owned playlist; `onDeleted` runs once YouTube has deleted it. */
export function youTubePlaylistActions(
  playlistId: string,
  title: string,
  onDeleted: () => void,
): PlaylistActions {
  return {
    onRename: (name) => {
      if (name === title) return;
      renameYouTubePlaylist(playlistId, name).then(
        () => showToast(`Renamed to ${name}`),
        () => refused("rename the playlist"),
      );
    },
    onDescribe: (description) =>
      describeYouTubePlaylist(playlistId, description).then(
        () => showToast("Description saved"),
        () => refused("save the description"),
      ),
    onPrivacy: (privacy) =>
      setYouTubePlaylistPrivacy(playlistId, privacy).then(
        () =>
          showToast(
            `${PRIVACY_CHOICES.find((c) => c.value === privacy)?.label} playlist`,
          ),
        () => refused("change who can see the playlist"),
      ),
    onDelete: () => {
      showToast("Deleting…");
      deleteYouTubePlaylist(playlistId).then(
        () => {
          const id = playlistId.replace(/^VL/, "");
          if (isPinned(id)) unpin(id);
          haptic.success();
          showToast(`Deleted ${title}`);
          onDeleted();
        },
        () => refused("delete the playlist"),
      );
    },
  };
}
