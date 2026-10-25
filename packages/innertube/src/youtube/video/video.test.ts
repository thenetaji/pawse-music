import {
  parseLockup,
  parseVideoDetail,
  parseVideoFeed,
  parseVideoSearch,
} from "./parse";
import { pickVideoFormat, videoLadder } from "./stream";

const run = (text: string, browseId?: string) => ({
  text,
  ...(browseId ? { navigationEndpoint: { browseEndpoint: { browseId } } } : {}),
});

const videoRenderer = (id: string, extra: Record<string, unknown> = {}) => ({
  videoRenderer: {
    videoId: id,
    title: { runs: [{ text: `Title ${id}` }] },
    ownerText: { runs: [run("Chan", "UC1")] },
    lengthText: { simpleText: "3:21" },
    viewCountText: { simpleText: "1,000 views" },
    publishedTimeText: { simpleText: "2 days ago" },
    thumbnail: {
      thumbnails: [{ url: "https://i.ytimg.com/a.jpg", width: 10, height: 5 }],
    },
    navigationEndpoint: { watchEndpoint: { videoId: id } },
    ...extra,
  },
});

const lockup = (id: string, contentType = "LOCKUP_CONTENT_TYPE_VIDEO") => ({
  lockupViewModel: {
    contentId: id,
    contentType,
    contentImage: {
      thumbnailViewModel: {
        image: {
          sources: [
            { url: "https://i.ytimg.com/b.jpg", width: 360, height: 202 },
          ],
        },
        overlays: [
          {
            thumbnailBottomOverlayViewModel: {
              badges: [{ thumbnailBadgeViewModel: { text: "1:02:03" } }],
            },
          },
        ],
      },
    },
    metadata: {
      lockupMetadataViewModel: {
        title: { content: `Lockup ${id}` },
        image: {
          decoratedAvatarViewModel: {
            avatar: {
              avatarViewModel: {
                image: {
                  sources: [
                    { url: "https://yt3/a.jpg", width: 68, height: 68 },
                  ],
                },
              },
            },
          },
        },
        metadata: {
          contentMetadataViewModel: {
            metadataRows: [
              {
                metadataParts: [
                  {
                    text: {
                      content: "Some Channel",
                      commandRuns: [
                        {
                          onTap: {
                            innertubeCommand: {
                              browseEndpoint: { browseId: "UC2" },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                metadataParts: [
                  {
                    text: { content: "343K" },
                    accessibilityLabel: "343 thousand views",
                  },
                  { text: { content: "1mo ago" } },
                ],
              },
            ],
          },
        },
      },
    },
    rendererContext: {
      commandContext: {
        onTap: { innertubeCommand: { watchEndpoint: { videoId: id } } },
      },
    },
  },
});

const continuation = (token: string) => ({
  continuationItemRenderer: {
    continuationEndpoint: { continuationCommand: { token } },
  },
});

describe("lockupViewModel", () => {
  it("reads title, channel, duration, views and age", () => {
    const v = parseLockup(lockup("aaaaaaaaaaa").lockupViewModel);
    expect(v).toMatchObject({
      type: "video",
      id: "aaaaaaaaaaa",
      title: "Lockup aaaaaaaaaaa",
      durationSec: 3723,
      viewsText: "343K views",
      publishedText: "1mo ago",
      channel: { id: "UC2", name: "Some Channel" },
    });
    expect(v?.channel?.avatar).toHaveLength(1);
  });

  it("ignores lockups that are not videos", () => {
    expect(
      parseLockup(
        lockup("bbbbbbbbbbb", "LOCKUP_CONTENT_TYPE_PLAYLIST").lockupViewModel,
      ),
    ).toBeUndefined();
  });

  it("is found inside richItemRenderer on a feed", () => {
    const feed = parseVideoFeed({
      contents: [
        { richItemRenderer: { content: lockup("ccccccccccc") } },
        continuation("next-page"),
      ],
    });
    expect(feed.items.map((i) => i.id)).toEqual(["ccccccccccc"]);
    expect(feed.continuation).toBe("next-page");
  });
});

describe("shorts and ads", () => {
  it("drops every Shorts shape and ad slot, keeps real videos", () => {
    const json = {
      contents: [
        videoRenderer("keepkeepkee"),
        {
          reelShelfRenderer: {
            items: [{ reelItemRenderer: { videoId: "shorts00001" } }],
          },
        },
        {
          richSectionRenderer: {
            content: {
              richShelfRenderer: {
                title: { runs: [{ text: "Shorts" }] },
                contents: [videoRenderer("shorts00002")],
              },
            },
          },
        },
        {
          gridShelfViewModel: {
            contents: [{ shortsLockupViewModel: { entityId: "x" } }],
          },
        },
        videoRenderer("shorts00003", {
          navigationEndpoint: {
            reelWatchEndpoint: { videoId: "shorts00003" },
          },
        }),
        videoRenderer("shorts00004", {
          navigationEndpoint: {
            commandMetadata: {
              webCommandMetadata: { url: "/shorts/shorts00004" },
            },
          },
        }),
        videoRenderer("shorts00005", {
          thumbnailOverlays: [
            {
              thumbnailOverlayTimeStatusRenderer: {
                style: "SHORTS",
                text: { simpleText: "0:30" },
              },
            },
          ],
        }),
        videoRenderer("shorts00006", {
          title: { runs: [{ text: "funny cat #Shorts" }] },
        }),
        {
          adSlotRenderer: { fulfillmentContent: videoRenderer("adadadadad1") },
        },
        { searchPyvRenderer: { ads: [videoRenderer("adadadadad2")] } },
        videoRenderer("upcomingv01", {
          upcomingEventData: { startTime: "1" },
        }),
        {
          radioRenderer: { playlistId: "RDabc", title: { simpleText: "Mix" } },
        },
        lockup("lockupkeep1"),
      ],
    };
    const ids = parseVideoSearch(json).items.map((i) => i.id);
    expect(ids).toEqual(["keepkeepkee", "lockupkeep1"]);
  });

  it("keeps a channel result and a normal video from search", () => {
    const res = parseVideoSearch({
      contents: [
        {
          channelRenderer: {
            channelId: "UC3",
            title: { simpleText: "Lofi Girl" },
            thumbnail: {
              thumbnails: [
                { url: "//yt3.ggpht.com/c.jpg", width: 88, height: 88 },
              ],
            },
            subscriberCountText: { simpleText: "@LofiGirl" },
            videoCountText: { simpleText: "15.8M subscribers" },
          },
        },
        videoRenderer("normalvideo"),
      ],
    });
    expect(res.items[0]).toEqual({
      type: "channel",
      id: "UC3",
      name: "Lofi Girl",
      avatar: [{ url: "https://yt3.ggpht.com/c.jpg", width: 88, height: 88 }],
      subscribersText: "15.8M subscribers",
    });
    expect(res.items[1]).toMatchObject({
      type: "video",
      id: "normalvideo",
      durationSec: 201,
    });
  });
});

describe("watch page", () => {
  it("reads chapters and related videos, without the current video", () => {
    const json = {
      contents: {
        twoColumnWatchNextResults: {
          results: {
            results: {
              contents: [
                {
                  videoPrimaryInfoRenderer: {
                    title: { runs: [{ text: "Main" }] },
                    viewCount: {
                      videoViewCountRenderer: {
                        shortViewCount: { simpleText: "24M views" },
                      },
                    },
                    relativeDateText: { simpleText: "9 years ago" },
                  },
                },
                {
                  videoSecondaryInfoRenderer: {
                    owner: {
                      videoOwnerRenderer: {
                        title: { runs: [run("Owner", "UC9")] },
                        thumbnail: {
                          thumbnails: [
                            { url: "https://yt3/o.jpg", width: 48, height: 48 },
                          ],
                        },
                      },
                    },
                    attributedDescription: { content: "About it" },
                  },
                },
              ],
            },
          },
          secondaryResults: {
            secondaryResults: {
              results: [lockup("relatedvi01"), lockup("mainmainmai")],
            },
          },
        },
      },
      engagementPanels: [
        {
          engagementPanelSectionListRenderer: {
            targetId: "engagement-panel-macro-markers-description-chapters",
            content: {
              macroMarkersListRenderer: {
                contents: [
                  {
                    macroMarkersListItemRenderer: {
                      title: { simpleText: "Intro" },
                      timeDescription: { simpleText: "0:00" },
                    },
                  },
                  {
                    macroMarkersListItemRenderer: {
                      title: { simpleText: "Part two" },
                      timeDescription: { simpleText: "1:07" },
                      onTap: { watchEndpoint: { startTimeSeconds: 67 } },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    };
    const d = parseVideoDetail(json, "mainmainmai");
    expect(d.video).toMatchObject({
      title: "Main",
      viewsText: "24M views",
      channel: { id: "UC9", name: "Owner" },
    });
    expect(d.description).toBe("About it");
    expect(d.chapters).toEqual([
      { title: "Intro", startSec: 0 },
      { title: "Part two", startSec: 67 },
    ]);
    expect(d.related.map((v) => v.id)).toEqual(["relatedvi01"]);
  });
});

describe("pickVideoFormat", () => {
  const f = (itag: number, height: number, mime: string, extra = {}) => ({
    itag,
    height,
    mimeType: mime,
    bitrate: height * 1000,
    url: `https://x/${itag}`,
    ...extra,
  });
  const formats = [
    f(137, 1080, 'video/mp4; codecs="avc1.640028"'),
    f(136, 720, 'video/mp4; codecs="avc1.4d401f"'),
    f(248, 1080, 'video/webm; codecs="vp9"'),
    f(401, 2160, 'video/mp4; codecs="av01.0.12M.08"'),
    f(140, 0, 'audio/mp4; codecs="mp4a.40.2"'),
  ];

  it("takes the tallest avc1 within the limit", () => {
    expect(pickVideoFormat(formats)?.itag).toBe(137);
    expect(pickVideoFormat(formats, 720)?.itag).toBe(136);
    expect(pickVideoFormat(formats, 360)).toBeUndefined();
  });

  it("skips ciphered formats unless allowed", () => {
    const ciphered = [
      {
        ...f(137, 1080, 'video/mp4; codecs="avc1.640028"'),
        url: undefined,
        signatureCipher: "s=x",
      },
    ];
    expect(pickVideoFormat(ciphered)).toBeUndefined();
    expect(pickVideoFormat(ciphered, 1080, true)?.itag).toBe(137);
  });
});

describe("videoLadder", () => {
  const avc = (itag: number, height: number, fps: number, bitrate: number) => ({
    itag,
    height,
    fps,
    bitrate,
    mimeType: 'video/mp4; codecs="avc1.640028"',
    url: `https://x/${itag}`,
  });

  it("keeps one avc1 per height and frame rate, best bitrate, tallest first", () => {
    const ladder = videoLadder([
      avc(137, 1080, 30, 4000),
      avc(299, 1080, 60, 6000),
      avc(136, 720, 30, 2000),
      avc(9136, 720, 30, 2500),
      avc(160, 144, 30, 100),
      { ...avc(248, 1080, 30, 3000), mimeType: 'video/webm; codecs="vp9"' },
    ]);
    expect(ladder.map((f) => f.itag)).toEqual([299, 137, 9136, 160]);
    expect(videoLadder(ladder, 720).map((f) => f.itag)).toEqual([9136, 160]);
  });
});
