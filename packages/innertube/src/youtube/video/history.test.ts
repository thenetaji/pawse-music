import { parseHistory } from "./parse";

const lockup = (id: string, pct?: number) => ({
  lockupViewModel: {
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    contentId: id,
    contentImage: {
      thumbnailViewModel: {
        overlays:
          pct === undefined
            ? []
            : [
                {
                  thumbnailBottomOverlayViewModel: {
                    progressBar: {
                      thumbnailOverlayProgressBarViewModel: {
                        startPercent: pct,
                      },
                    },
                  },
                },
              ],
      },
    },
    metadata: {
      lockupMetadataViewModel: { title: { content: `Video ${id}` } },
    },
  },
});

const section = (title: string, contents: unknown[]) => ({
  itemSectionRenderer: {
    header: {
      itemSectionHeaderRenderer: { title: { runs: [{ text: title }] } },
    },
    contents,
  },
});

describe("watch history", () => {
  it("keeps each day's heading and how far you got", () => {
    const h = parseHistory({
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      section("Today", [
                        lockup("aaaaaaaaaaa", 42),
                        lockup("bbbbbbbbbbb"),
                      ]),
                      section("Monday", [
                        {
                          videoRenderer: {
                            videoId: "ccccccccccc",
                            title: { runs: [{ text: "Old style" }] },
                            thumbnailOverlays: [
                              {
                                thumbnailOverlayResumePlaybackRenderer: {
                                  percentDurationWatched: 100,
                                },
                              },
                            ],
                          },
                        },
                      ]),
                      {
                        continuationItemRenderer: {
                          continuationEndpoint: {
                            continuationCommand: { token: "NEXT" },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(h.items.map((i) => [i.video.id, i.day, i.video.watched])).toEqual([
      ["aaaaaaaaaaa", "Today", 0.42],
      ["bbbbbbbbbbb", "Today", undefined],
      ["ccccccccccc", "Monday", 1],
    ]);
    expect(h.continuation).toBe("NEXT");
  });
});
