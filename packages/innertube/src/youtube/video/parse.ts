import type {
  ChannelItem,
  ChannelPage,
  CommentPage,
  Thumbnail,
  VideoComment,
  VideoDetail,
  VideoFeed,
  VideoHistory,
  VideoItem,
  VideoPlaylistItem,
  VideoSearchResults,
} from "@pawse/music-core";

import {
  arr,
  browseOf,
  dig,
  type Node,
  obj,
  parseDuration,
  text,
  thumbnails,
  tokenOfItem,
} from "../nodes";

type Found = VideoItem | ChannelItem | VideoPlaylistItem;

// The item's menu as YouTube sends it signed in: each entry's label sits beside its feedback token.
function feedbackOf(item: Node): VideoItem["feedback"] {
  const out: NonNullable<VideoItem["feedback"]> = {};
  const walk = (n: unknown, label: string, depth: number) => {
    if (!n || typeof n !== "object" || depth > 40) return;
    const o = n as Node;
    const here =
      text(o.title) || text(o.text) || String(o.title?.content ?? "") || label;
    const token = o.feedbackEndpoint?.feedbackToken;
    if (typeof token === "string") {
      if (/not interested/i.test(here)) out.notInterested ??= token;
      else if (/don.t recommend channel/i.test(here)) out.channel ??= token;
    }
    for (const v of Object.values(o)) walk(v, here, depth + 1);
  };
  walk(item, "", 0);
  return out.notInterested || out.channel ? out : undefined;
}

// Keys whose subtree is never catalog content: ads, Shorts, nudges and page chrome.
const SKIP_KEY =
  /^(adSlot|searchPyv|promoted|inFeedAd|compactPromoted|displayAd|videoMastheadAd|reelShelf|reelItem|shortsLockup|shortsShelf|ytdShorts|feedNudge|menu|topbar|frameworkUpdates|responseContext|engagementPanels|playerOverlays|thumbnailOverlays|overlays|onTap|navigationEndpoint)/;
// Shelf-like wrappers that drop out when their title is "Shorts".
const SHELF_KEY = /^(richShelfRenderer|shelfRenderer|richSectionRenderer)$/;
const VIDEO_ID = /^[\w-]{11}$/;
const SHORT_HASHTAG = /#shorts?\b/i;

/** True when a node's own wiring says it is a Short. */
export function isShortNode(node: unknown): boolean {
  const s = JSON.stringify(node) ?? "";
  return (
    s.includes('"reelWatchEndpoint"') ||
    s.includes('"url":"/shorts/') ||
    s.includes('"style":"SHORTS"')
  );
}

const shelfTitle = (n: Node): string =>
  text(n.title ?? dig(n, "header", "richListHeaderRenderer", "title"))
    .trim()
    .toLowerCase();

const fallbackThumb = (id: string): Thumbnail[] => [
  {
    url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    width: 480,
    height: 360,
  },
];

const clean = (s: string | undefined): string | undefined =>
  s?.trim() ? s.trim() : undefined;

const firstKey = (v: unknown, key: string, depth = 14): string | undefined => {
  if (depth < 0) return undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const f = firstKey(x, key, depth - 1);
      if (f) return f;
    }
    return undefined;
  }
  const o = obj(v);
  if (!o) return undefined;
  if (typeof o[key] === "string") return o[key];
  for (const k of Object.keys(o)) {
    const f = firstKey(o[k], key, depth - 1);
    if (f) return f;
  }
  return undefined;
};

const channelOf = (
  rs: { text: string; navigationEndpoint?: Node }[],
  avatar?: Thumbnail[],
): VideoItem["channel"] => {
  const r = rs[0];
  if (!r?.text) return undefined;
  const id = browseOf(r.navigationEndpoint).browseId;
  return {
    ...(id ? { id } : {}),
    name: r.text,
    ...(avatar?.length ? { avatar } : {}),
  };
};

const overlayStatus = (v: Node): { text?: string; style?: string } => {
  for (const o of arr(v.thumbnailOverlays)) {
    const t = obj(o?.thumbnailOverlayTimeStatusRenderer);
    if (t) return { text: text(t.text), style: t.style };
  }
  return {};
};

/** videoRenderer, gridVideoRenderer, compactVideoRenderer and playlistVideoRenderer. */
// YouTube's own music tag: a music video opens as a radio (start_radio) and carries a music icon.
const MUSIC_MARK = /start_radio=1|"iconType":"[A-Z_]*MUSIC/;
export const isMusicNode = (v: Node) => MUSIC_MARK.test(JSON.stringify(v));

export function parseVideoRenderer(v: Node): VideoItem | undefined {
  const id = v.videoId;
  if (typeof id !== "string" || !VIDEO_ID.test(id)) return undefined;
  if (v.upcomingEventData || isShortNode(v.navigationEndpoint))
    return undefined;
  const status = overlayStatus(v);
  if (status.style === "SHORTS" || status.style === "UPCOMING")
    return undefined;
  const title =
    text(v.title) ||
    dig(v, "title", "accessibility", "accessibilityData", "label");
  if (!title || SHORT_HASHTAG.test(title)) return undefined;
  const byline = v.ownerText ?? v.longBylineText ?? v.shortBylineText;
  const avatar = thumbnails(v.channelThumbnailSupportedRenderers);
  const live =
    status.style === "LIVE" ||
    arr(v.badges).some(
      (b) =>
        dig(b, "metadataBadgeRenderer", "style") ===
        "BADGE_STYLE_TYPE_LIVE_NOW",
    );
  const thumbs = thumbnails(v.thumbnail);
  return {
    type: "video",
    id,
    title,
    channel: channelOf(
      arr(dig(byline, "runs")).filter((r) => typeof r?.text === "string"),
      avatar,
    ),
    durationSec:
      parseDuration(text(v.lengthText)) ?? parseDuration(status.text),
    viewsText: clean(text(v.viewCountText) || text(v.shortViewCountText)),
    publishedText: clean(text(v.publishedTimeText)),
    thumbnails: thumbs.length ? thumbs : fallbackThumb(id),
    ...(live ? { live: true } : {}),
    ...(isMusicNode(v) ? { music: true } : {}),
    ...withFeedback(v),
  };
}

const withFeedback = (n: Node) => {
  const feedback = feedbackOf(n);
  const watched = progressOf(n);
  return {
    ...(feedback ? { feedback } : {}),
    ...(watched !== undefined ? { watched } : {}),
  };
};

// The red bar on a thumbnail you've watched: the old renderer's resume overlay or the lockup's progress bar.
function progressOf(item: Node): number | undefined {
  let found: number | undefined;
  const walk = (n: unknown, depth: number) => {
    if (found !== undefined || !n || typeof n !== "object" || depth > 30)
      return;
    const o = n as Node;
    const pct =
      o.thumbnailOverlayResumePlaybackRenderer?.percentDurationWatched ??
      o.thumbnailOverlayProgressBarViewModel?.startPercent;
    if (typeof pct === "number") {
      found = Math.max(0, Math.min(1, pct / 100));
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(item, 0);
  return found;
}

const isViews = (s: string) => /\b(views?|watching)\b/i.test(s);
const isWhen = (s: string) =>
  /\bago\b|^(streamed|premiered|updated)\b/i.test(s);

/** lockupViewModel of contentType LOCKUP_CONTENT_TYPE_VIDEO. */
export function parseLockup(l: Node): VideoItem | undefined {
  if (l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return undefined;
  const id = l.contentId;
  if (typeof id !== "string" || !VIDEO_ID.test(id)) return undefined;
  const wiring = l.rendererContext ?? {};
  if (isShortNode(wiring)) return undefined;
  const meta = obj(dig(l, "metadata", "lockupMetadataViewModel")) ?? {};
  const title = text(meta.title);
  if (!title || SHORT_HASHTAG.test(title)) return undefined;
  let durationSec: number | undefined;
  let live = false;
  const badges = arr(
    dig(l, "contentImage", "thumbnailViewModel", "overlays"),
  ).flatMap((o) => arr(dig(o, "thumbnailBottomOverlayViewModel", "badges")));
  for (const b of badges) {
    const bv = obj(b?.thumbnailBadgeViewModel);
    if (!bv) continue;
    const t = String(bv.text ?? "");
    if (/live/i.test(t) || /LIVE/.test(String(bv.badgeStyle ?? "")))
      live = true;
    durationSec ??= parseDuration(t);
    if (/upcoming|scheduled/i.test(t)) return undefined;
  }
  const rows: Node[][] = arr(
    dig(meta, "metadata", "contentMetadataViewModel", "metadataRows"),
  ).map((r) => arr(r?.metadataParts));
  let name: string | undefined;
  let viewsText: string | undefined;
  let publishedText: string | undefined;
  for (const part of rows.flat()) {
    const content = String(dig(part, "text", "content") ?? "").trim();
    const label = String(part?.accessibilityLabel ?? content);
    if (!content) continue;
    if (/^(scheduled|waiting)/i.test(content)) return undefined;
    if (isWhen(label) || isWhen(content)) publishedText ??= content;
    else if (isViews(label) || isViews(content))
      viewsText ??= isViews(content) ? content : `${content} views`;
    else name ??= content;
  }
  const avatar = thumbnails(dig(meta, "image"));
  const thumbs = thumbnails(
    dig(l, "contentImage", "thumbnailViewModel", "image"),
  );
  const channelId =
    firstKey(dig(meta, "image"), "browseId") ??
    firstKey(dig(meta, "metadata"), "browseId");
  return {
    type: "video",
    id,
    title,
    ...(name
      ? {
          channel: {
            ...(channelId ? { id: channelId } : {}),
            name,
            ...(avatar.length ? { avatar } : {}),
          },
        }
      : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(viewsText ? { viewsText } : {}),
    ...(publishedText ? { publishedText } : {}),
    thumbnails: thumbs.length ? thumbs : fallbackThumb(id),
    ...(live ? { live: true } : {}),
    ...withFeedback(l),
  };
}

/** channelRenderer from a search page. */
export function parseChannelRenderer(c: Node): ChannelItem | undefined {
  const id = c.channelId;
  const name = text(c.title);
  if (typeof id !== "string" || !name) return undefined;
  const subs = [c.subscriberCountText, c.videoCountText]
    .map((t) => text(t))
    .find((t) => /subscribers?$/i.test(t.trim()));
  return {
    type: "channel",
    id,
    name,
    avatar: thumbnails(c.thumbnail),
    ...(subs ? { subscribersText: subs.trim() } : {}),
  };
}

interface Walk {
  items: Found[];
  continuation?: string;
}

/** Collects videos and channels in page order, skipping Shorts, ads and mixes. */
export function collect(root: unknown, into: Walk = { items: [] }): Walk {
  const seen = new Set(into.items.map((i) => `${i.type}:${i.id}`));
  const visit = (v: unknown, depth: number): void => {
    if (depth > 40) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = obj(v);
    if (!o) return;
    const token = tokenOfItem(o);
    if (token) into.continuation = token;
    for (const key of Object.keys(o)) {
      if (SKIP_KEY.test(key)) continue;
      const child = o[key];
      let item: Found | undefined;
      switch (key) {
        case "videoRenderer":
        case "gridVideoRenderer":
        case "compactVideoRenderer":
          item = parseVideoRenderer(child);
          break;
        case "lockupViewModel":
          item = parseLockup(child) ?? parsePlaylistLockup(child);
          break;
        case "channelRenderer":
          item = parseChannelRenderer(child);
          break;
        default:
          if (
            SHELF_KEY.test(key) &&
            obj(child) &&
            shelfTitle(child) === "shorts"
          )
            continue;
          visit(child, depth + 1);
          continue;
      }
      if (item && !seen.has(`${item.type}:${item.id}`)) {
        seen.add(`${item.type}:${item.id}`);
        into.items.push(item);
      }
    }
  };
  visit(root, 0);
  return into;
}

/** lockupViewModel of a playlist or course: a stack of videos with a count. */
export function parsePlaylistLockup(l: Node): VideoPlaylistItem | undefined {
  const type = l.contentType;
  if (
    type !== "LOCKUP_CONTENT_TYPE_PLAYLIST" &&
    type !== "LOCKUP_CONTENT_TYPE_COURSE"
  )
    return undefined;
  const id = l.contentId;
  if (typeof id !== "string" || !id) return undefined;
  // Mixes ("RD…") never end and aren't anyone's list.
  if (id.startsWith("RD")) return undefined;
  const meta = obj(dig(l, "metadata", "lockupMetadataViewModel")) ?? {};
  const title = text(meta.title);
  if (!title) return undefined;
  const author = findText(
    dig(meta, "metadata", "contentMetadataViewModel", "metadataRows", 0),
    /\S/,
  );
  const countText = findText(
    dig(l, "contentImage"),
    /\d.*\b(videos?|lessons?)\b/i,
  );
  const thumbs = thumbnails(
    dig(
      l,
      "contentImage",
      "collectionThumbnailViewModel",
      "primaryThumbnail",
      "thumbnailViewModel",
      "image",
    ),
  );
  return {
    type: "playlist",
    id,
    title,
    ...(author ? { author } : {}),
    ...(countText ? { countText } : {}),
    thumbnails: thumbs,
  };
}

const onlyVideos = (items: Found[]): VideoItem[] =>
  items.filter((i): i is VideoItem => i.type === "video");

/** Home, subscriptions and any browse continuation. */
export function parseVideoFeed(json: unknown): VideoFeed {
  const { items, continuation } = collect(json);
  return {
    items: onlyVideos(items),
    ...(continuation ? { continuation } : {}),
  };
}

/** The watch history page: each day's section with its heading, videos in order. */
export function parseHistory(json: unknown): VideoHistory {
  const items: VideoHistory["items"] = [];
  const seen = new Set<string>();
  let continuation: string | undefined;
  const visit = (v: unknown, depth: number): void => {
    if (depth > 40) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = obj(v);
    if (!o) return;
    const section = obj(o.itemSectionRenderer);
    if (section) {
      const day =
        text(dig(section, "header", "itemSectionHeaderRenderer", "title")) ||
        undefined;
      const found = collect(section.contents);
      continuation = found.continuation ?? continuation;
      for (const video of onlyVideos(found.items)) {
        if (seen.has(video.id)) continue;
        seen.add(video.id);
        items.push({ video, ...(day ? { day } : {}) });
      }
      return;
    }
    const token = tokenOfItem(o);
    if (token) continuation = token;
    for (const key of Object.keys(o)) {
      if (key === "responseContext" || key === "frameworkUpdates") continue;
      visit(o[key], depth + 1);
    }
  };
  visit(json, 0);
  return { items, ...(continuation ? { continuation } : {}) };
}

export function parseVideoSearch(json: unknown): VideoSearchResults {
  const { items, continuation } = collect(json);
  return { items, ...(continuation ? { continuation } : {}) };
}

const findText = (
  root: unknown,
  re: RegExp,
  depth = 12,
): string | undefined => {
  if (depth < 0) return undefined;
  if (typeof root === "string")
    return re.test(root.trim()) ? root.trim() : undefined;
  if (Array.isArray(root)) {
    for (const x of root) {
      const f = findText(x, re, depth - 1);
      if (f) return f;
    }
    return undefined;
  }
  const o = obj(root);
  if (!o) return undefined;
  for (const k of Object.keys(o)) {
    if (k === "onTap" || k === "navigationEndpoint") continue;
    const f = findText(o[k], re, depth - 1);
    if (f) return f;
  }
  return undefined;
};

// The first boolean under `key`: the subscribe button and the newer subscription-state entity both use "subscribed".
const findBool = (
  root: unknown,
  key: string,
  depth = 24,
): boolean | undefined => {
  if (depth < 0) return undefined;
  if (Array.isArray(root)) {
    for (const x of root) {
      const f = findBool(x, key, depth - 1);
      if (f !== undefined) return f;
    }
    return undefined;
  }
  const o = obj(root);
  if (!o) return undefined;
  if (typeof o[key] === "boolean") return o[key] as boolean;
  for (const k of Object.keys(o)) {
    const f = findBool(o[k], key, depth - 1);
    if (f !== undefined) return f;
  }
  return undefined;
};

/** A channel's Videos tab; `fallback` supplies the channel when this is a continuation page. */
export function parseChannel(
  json: unknown,
  id: string,
  fallback?: ChannelItem,
): ChannelPage {
  const meta = obj(dig(json, "metadata", "channelMetadataRenderer"));
  const header = dig(json, "header");
  const avatar = meta
    ? thumbnails(meta.avatar)
    : (fallback?.avatar ?? thumbnails(header));
  const channel: ChannelItem = {
    type: "channel",
    id: (meta?.externalId as string | undefined) ?? fallback?.id ?? id,
    name: (meta?.title as string | undefined) ?? fallback?.name ?? "",
    avatar,
    ...(findText(header, /subscribers?$/i) || fallback?.subscribersText
      ? {
          subscribersText:
            findText(header, /subscribers?$/i) ?? fallback?.subscribersText,
        }
      : {}),
  };
  const banner = thumbnails(
    dig(
      header,
      "pageHeaderRenderer",
      "content",
      "pageHeaderViewModel",
      "banner",
    ) ?? dig(header, "c4TabbedHeaderRenderer", "banner"),
  );
  const mine: VideoItem["channel"] = {
    id: channel.id,
    name: channel.name,
    ...(channel.avatar.length ? { avatar: channel.avatar } : {}),
  };
  const { items, continuation } = collect(json);
  const videos = onlyVideos(items).map((v) =>
    v.channel ? v : { ...v, channel: mine },
  );
  const subscribed =
    findBool(dig(json, "frameworkUpdates"), "subscribed") ??
    findBool(header, "subscribed");
  return {
    channel,
    ...(banner.length ? { banner } : {}),
    videos,
    ...(continuation ? { continuation } : {}),
    ...(subscribed !== undefined ? { subscribed } : {}),
  };
}

function chaptersOf(json: unknown): { title: string; startSec: number }[] {
  const out: { title: string; startSec: number }[] = [];
  const panels = arr(dig(json, "engagementPanels")).map((p) =>
    obj(p?.engagementPanelSectionListRenderer),
  );
  const ordered = [
    ...panels.filter((p) => /chapters/.test(String(p?.targetId ?? ""))),
    ...panels.filter((p) => !/chapters/.test(String(p?.targetId ?? ""))),
  ];
  for (const p of ordered) {
    for (const c of arr(
      dig(p, "content", "macroMarkersListRenderer", "contents"),
    )) {
      const m = obj(c?.macroMarkersListItemRenderer);
      if (!m) continue;
      const start =
        dig(m, "onTap", "watchEndpoint", "startTimeSeconds") ??
        parseDuration(text(m.timeDescription));
      const title = text(m.title);
      if (title && typeof start === "number")
        out.push({ title, startSec: start });
    }
    if (out.length) return dedupe(out);
  }
  const bar = dig(
    json,
    "playerOverlays",
    "playerOverlayRenderer",
    "decoratedPlayerBarRenderer",
    "playerBar",
    "multiMarkersPlayerBarRenderer",
    "markersMap",
  );
  for (const m of arr(bar)) {
    for (const c of arr(dig(m, "value", "chapters"))) {
      const r = obj(c?.chapterRenderer);
      const ms = Number(r?.timeRangeStartMillis);
      const title = text(r?.title);
      if (title && Number.isFinite(ms))
        out.push({ title, startSec: ms / 1000 });
    }
  }
  return dedupe(out);
}

const dedupe = (cs: { title: string; startSec: number }[]) => {
  const seen = new Set<number>();
  return cs
    .filter((c) => !seen.has(c.startSec) && !!seen.add(c.startSec))
    .sort((a, b) => a.startSec - b.startSec);
};

/** The `next` response of a watch page. */
export function parseVideoDetail(json: unknown, id: string): VideoDetail {
  const results = arr(
    dig(
      json,
      "contents",
      "twoColumnWatchNextResults",
      "results",
      "results",
      "contents",
    ),
  );
  const primary = obj(
    results.find((r) => r?.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer,
  );
  const secondary = obj(
    results.find((r) => r?.videoSecondaryInfoRenderer)
      ?.videoSecondaryInfoRenderer,
  );
  const owner = obj(dig(secondary, "owner", "videoOwnerRenderer"));
  const micro = obj(dig(json, "microformat", "microformatDataRenderer"));
  const views = dig(primary, "viewCount", "videoViewCountRenderer");
  const ownerRuns = arr(dig(owner, "title", "runs"));
  const avatar = thumbnails(owner?.thumbnail);
  const thumbs = thumbnails(micro?.thumbnail);
  const description =
    clean(text(secondary?.attributedDescription)) ??
    clean(text(secondary?.description)) ??
    clean(micro?.description as string | undefined);
  const live =
    arr(dig(primary, "badges")).some(
      (b) =>
        dig(b, "metadataBadgeRenderer", "style") ===
        "BADGE_STYLE_TYPE_LIVE_NOW",
    ) || undefined;
  const video: VideoItem = {
    type: "video",
    id,
    title: text(primary?.title) || (micro?.title as string | undefined) || "",
    channel: channelOf(ownerRuns, avatar),
    viewsText: clean(text(views?.shortViewCount) || text(views?.viewCount)),
    publishedText: clean(
      text(primary?.relativeDateText) || text(primary?.dateText),
    ),
    thumbnails: thumbs.length ? thumbs : fallbackThumb(id),
    ...(live ? { live: true } : {}),
  };
  const related = onlyVideos(
    collect(
      dig(json, "contents", "twoColumnWatchNextResults", "secondaryResults"),
    ).items,
  ).filter((v) => v.id !== id);
  const sub = obj(dig(secondary, "subscribeButton", "subscribeButtonRenderer"));
  const status = firstKey(json, "likeStatus");
  // "like this video along with 110,273 other people"
  const likeA11y = JSON.stringify(primary ?? {}).match(
    /along with ([\d,.]+) other/,
  );
  const comments = arr(
    obj(
      results.find(
        (r) =>
          r?.itemSectionRenderer?.sectionIdentifier === "comment-item-section",
      )?.itemSectionRenderer,
    )?.contents,
  );
  const commentsToken = tokenOf(comments[0]?.continuationItemRenderer);
  return {
    video,
    ...(description ? { description } : {}),
    chapters: chaptersOf(json),
    related,
    ...(clean(text(owner?.subscriberCountText))
      ? { subscribersText: clean(text(owner?.subscriberCountText)) }
      : {}),
    ...(typeof sub?.subscribed === "boolean"
      ? { subscribed: sub.subscribed as boolean }
      : {}),
    ...(status
      ? {
          rating:
            status === "LIKE"
              ? ("like" as const)
              : status === "DISLIKE"
                ? ("dislike" as const)
                : ("none" as const),
        }
      : {}),
    ...(likeA11y ? { likes: Number(likeA11y[1].replace(/[,.]/g, "")) } : {}),
    ...(commentsToken ? { comments: commentsToken } : {}),
  };
}

const tokenOf = (n: unknown): string | undefined => {
  const t =
    dig(n, "continuationEndpoint", "continuationCommand", "token") ??
    dig(
      n,
      "button",
      "buttonRenderer",
      "command",
      "continuationCommand",
      "token",
    );
  return typeof t === "string" ? t : undefined;
};

/** A page of comments or replies: the list holds view-model keys, and the text lives in `frameworkUpdates`. */
export function parseComments(json: unknown): CommentPage {
  const entities = new Map<string, Node>();
  for (const m of arr(
    dig(json, "frameworkUpdates", "entityBatchUpdate", "mutations"),
  )) {
    const p = obj(m?.payload);
    const v = p && (Object.values(p)[0] as Node | undefined);
    if (typeof m?.entityKey === "string" && v) entities.set(m.entityKey, v);
  }
  const list: Node[] = [];
  for (const e of arr(dig(json, "onResponseReceivedEndpoints")))
    list.push(
      ...arr(
        dig(e, "reloadContinuationItemsCommand", "continuationItems") ??
          dig(e, "appendContinuationItemsAction", "continuationItems"),
      ),
    );
  let count: string | undefined;
  let continuation: string | undefined;
  const items: VideoComment[] = [];
  for (const it of list) {
    const head = obj(it?.commentsHeaderRenderer);
    if (head) {
      count = clean(arr(dig(head, "countText", "runs"))[0]?.text as string);
      continue;
    }
    if (it?.continuationItemRenderer) {
      continuation = tokenOf(it.continuationItemRenderer);
      continue;
    }
    const thread = obj(it?.commentThreadRenderer);
    const vm = obj(
      thread
        ? dig(thread, "commentViewModel", "commentViewModel")
        : it?.commentViewModel,
    );
    const c = obj(entities.get(vm?.commentKey as string));
    if (!c) continue;
    const props = obj(c.properties);
    const author = obj(c.author);
    const bar = obj(c.toolbar);
    const state = obj(entities.get(vm?.toolbarStateKey as string));
    const repliesToken = tokenOf(
      arr(dig(thread, "replies", "commentRepliesRenderer", "contents"))[0]
        ?.continuationItemRenderer,
    );
    const replies = clean(bar?.replyCount as string | undefined);
    const likes = clean(bar?.likeCountNotliked as string | undefined);
    items.push({
      id: String(props?.commentId ?? vm?.commentId ?? ""),
      text: text(props?.content),
      author: {
        ...(typeof author?.channelId === "string"
          ? { id: author.channelId }
          : {}),
        name: String(author?.displayName ?? ""),
        ...(typeof author?.avatarThumbnailUrl === "string"
          ? { avatar: author.avatarThumbnailUrl }
          : {}),
        ...(author?.isCreator ? { creator: true } : {}),
      },
      ...(clean(props?.publishedTime as string | undefined)
        ? { published: clean(props?.publishedTime as string) }
        : {}),
      ...(likes && likes !== "0" ? { likes } : {}),
      ...(replies && replies !== "0" ? { replies } : {}),
      ...(repliesToken ? { repliesToken } : {}),
      ...(vm?.pinnedText ? { pinned: true } : {}),
      ...(state?.heartState === "TOOLBAR_HEART_STATE_HEARTED"
        ? { hearted: true }
        : {}),
      ...(Number(props?.replyLevel) > 0 ? { reply: true } : {}),
    });
  }
  return {
    ...(count ? { count } : {}),
    items,
    ...(continuation ? { continuation } : {}),
  };
}

/** Body of suggestqueries: JSON, or JSONP around it. */
export function parseSuggestionsJson(body: string): string[] {
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return arr(parsed?.[1])
      .map((s) => (Array.isArray(s) ? s[0] : s))
      .filter((s): s is string => typeof s === "string" && !!s);
  } catch {
    return [];
  }
}
