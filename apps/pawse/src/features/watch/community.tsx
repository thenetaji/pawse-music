import type { SkipSegment, SegmentCategory } from "@pawse/innertube";
import type { Storyboard, VideoDetail } from "@pawse/music-core";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { askText, SheetNote, showSheet } from "../../components/action-sheet";
import { showToast } from "../../components/toast";
import { clock } from "../../components/video-card";
import { brandingOf, skipNote, useCrowdChapters } from "../../lib/community";
import {
  contributing,
  sendSegment,
  sendThumbnail,
  sendTitle,
  voteSegment,
  voteThumbnail,
  voteTitle,
} from "../../lib/contribute";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { StoryboardFrame } from "./storyboard";
import { type Clock, useClock } from "./video-controls";

export function useCrowdDetail(
  id: string,
  d: VideoDetail | undefined,
): VideoDetail | undefined {
  const crowd = useCrowdChapters(id, !!d && !d.chapters.length);
  return useMemo(
    () =>
      d && crowd?.length && !d.chapters.length ? { ...d, chapters: crowd } : d,
    [d, crowd],
  );
}

const PILL_WINDOW_SEC = 15;

export function HighlightPill({
  at,
  clock: ticks,
  onJump,
}: {
  at?: number;
  clock: Clock;
  onJump: (sec: number) => void;
}) {
  const now = useClock(ticks);
  const [used, setUsed] = useState(false);
  if (at === undefined || used || now > PILL_WINDOW_SEC || at < now + 10)
    return null;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        setUsed(true);
        onJump(at);
      }}
      style={styles.pill}
      accessibilityLabel="Jump to the best part"
    >
      <Text style={styles.pillText}>Jump to the best part</Text>
    </Pressable>
  );
}

export function skipToast(seg: SkipSegment, videoId: string) {
  const uuid = seg.uuid;
  showToast(skipNote(seg.category), {
    ...(uuid && contributing()
      ? {
          ms: 5000,
          votes: {
            up: () => voteSegment({ uuid, videoId }, true),
            down: () => voteSegment({ uuid, videoId }, false),
          },
        }
      : {}),
  });
}

export type Where = {
  id: string;
  getTime: () => number;
  durationSec?: number;
  storyboard?: Storyboard;
  title?: string;
};

const CATEGORIES: [SegmentCategory, string, string][] = [
  ["sponsor", "Sponsor", "A paid promotion or product placement"],
  [
    "selfpromo",
    "Self-promotion",
    "The creator's own merch, channel or other plugs",
  ],
  ["interaction", "Reminder", "“Like and subscribe”, “follow me”"],
  ["intro", "Intro", "A title card or animation that repeats"],
  ["outro", "Outro", "End cards, credits, “thanks for watching”"],
  ["music_offtopic", "Non-music part", "Talking or silence in a music video"],
];

const at = (sec: number) => clock(Math.floor(sec)) || "0:00";

let draft: { id: string; start: number } | undefined;

function sayOff() {
  showToast(
    "Turn on “Help SponsorBlock, DeArrow and Return YouTube Dislike” in Settings, and Incognito off",
    {
      bad: true,
    },
  );
}

function pickCategory(w: Where, a: number, b: number) {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end - start < 1)
    return showToast("That’s under a second. Pick a longer stretch", {
      bad: true,
    });
  showSheet({
    title: `What is ${at(start)} to ${at(end)}?`,
    actions: CATEGORIES.map(([category, label, sub]) => ({
      label,
      sub,
      onPress: () => {
        draft = undefined;
        sendSegment({
          videoId: w.id,
          start,
          end,
          category,
          duration: w.durationSec,
        });
      },
    })),
  });
}

export function markSegment(w: Where) {
  if (!contributing()) return sayOff();
  const now = w.getTime();
  const d = draft?.id === w.id ? draft : undefined;
  showSheet({
    title: "Mark a segment",
    actions: [
      ...(d
        ? [
            {
              label: `It ends here (${at(now)})`,
              sub: `It started at ${at(d.start)}`,
              onPress: () => pickCategory(w, d.start, now),
            },
          ]
        : []),
      {
        label: `It starts here (${at(now)})`,
        sub: "Play on to where it ends, then open this again",
        onPress: () => {
          draft = { id: w.id, start: now };
          showToast(`Start saved at ${at(now)}`);
        },
      },
      {
        label: `The best part is here (${at(now)})`,
        sub: "One moment that shows what the video is about",
        onPress: () =>
          sendSegment({
            videoId: w.id,
            start: now,
            end: now,
            category: "poi_highlight",
            duration: w.durationSec,
          }),
      },
    ],
  });
}

function suggestTitle(w: Where) {
  if (!contributing()) return sayOff();
  askText({
    title: "Suggest a better title",
    placeholder: "A clear, honest title",
    initial: w.title,
    confirm: "Send to DeArrow",
    onSubmit: (text) => {
      if (text && text !== "A clear, honest title") sendTitle(w.id, text);
    },
  });
}

function pickThumbnail(w: Where) {
  if (!contributing()) return sayOff();
  const dur = w.durationSec ?? 0;
  const now = w.getTime();
  const times = dur
    ? Array.from({ length: 8 }, (_, i) => Math.round(dur * (0.06 + i * 0.125)))
    : [];
  const frame = (sec: number, label: string) => ({
    label,
    sub: at(sec),
    icon: w.storyboard ? (
      <StoryboardFrame sb={w.storyboard} sec={sec} scale={0.6} />
    ) : undefined,
    onPress: () => sendThumbnail(w.id, sec),
  });
  showSheet({
    title: "Pick a thumbnail",
    actions: [
      frame(now, "This moment"),
      ...times.map((t) => frame(t, "Frame")),
    ],
  });
}

export function communityMenu(w: Where, original?: string) {
  const b = brandingOf(w.id);
  const on = contributing();
  showSheet({
    header: original ? (
      <SheetNote
        title="DeArrow changed this video"
        body={`Original title: ${original}`}
      />
    ) : undefined,
    title: original ? undefined : "Help the community",
    actions: [
      {
        label: "Mark a segment",
        sub: "SponsorBlock: sponsors, intros, the best part",
        onPress: () => markSegment(w),
      },
      {
        label: "Suggest a better title",
        sub: "DeArrow",
        onPress: () => suggestTitle(w),
      },
      {
        label: "Pick a thumbnail",
        sub: "DeArrow",
        onPress: () => pickThumbnail(w),
      },
      ...(on && b?.rawTitle
        ? [
            {
              label: "This title is good",
              onPress: () => voteTitle(w.id, b.rawTitle!, true),
            },
            {
              label: "This title is wrong",
              onPress: () => voteTitle(w.id, b.rawTitle!, false),
            },
          ]
        : []),
      ...(on && b?.thumbnailTime !== undefined
        ? [
            {
              label: "This thumbnail is good",
              onPress: () => voteThumbnail(w.id, b.thumbnailTime!, true),
            },
            {
              label: "This thumbnail is wrong",
              onPress: () => voteThumbnail(w.id, b.thumbnailTime!, false),
            },
          ]
        : []),
    ],
  });
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    left: 12,
    bottom: 64,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  pillText: { color: "#fff", fontSize: 13, ...display("700") },
});
