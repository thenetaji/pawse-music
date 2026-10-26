import { parseLockup, parseVideoRenderer } from "./parse";

const menuItem = (label: string, token: string) => ({
  listItemViewModel: {
    title: { content: label },
    rendererContext: {
      commandContext: {
        onTap: {
          innertubeCommand: { feedbackEndpoint: { feedbackToken: token } },
        },
      },
    },
  },
});

describe("feedback tokens", () => {
  it("reads Not interested and Don't recommend channel from a lockup's menu", () => {
    const v = parseLockup({
      contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
      contentId: "dQw4w9WgXcQ",
      metadata: {
        lockupMetadataViewModel: {
          title: { content: "A video" },
          menuButton: {
            sheet: {
              listItems: [
                menuItem("Add to queue", "q"),
                menuItem("Not interested", "NI"),
                menuItem("Don't recommend channel", "DRC"),
              ],
            },
          },
        },
      },
    });
    expect(v?.feedback).toEqual({ notInterested: "NI", channel: "DRC" });
  });

  it("reads them from a classic videoRenderer menu", () => {
    const v = parseVideoRenderer({
      videoId: "dQw4w9WgXcQ",
      title: { runs: [{ text: "A video" }] },
      menu: {
        menuRenderer: {
          items: [
            {
              menuServiceItemRenderer: {
                text: { runs: [{ text: "Not interested" }] },
                serviceEndpoint: { feedbackEndpoint: { feedbackToken: "NI2" } },
              },
            },
          ],
        },
      },
    });
    expect(v?.feedback).toEqual({ notInterested: "NI2" });
  });

  it("leaves it out signed out, where menus carry no tokens", () => {
    const v = parseVideoRenderer({
      videoId: "dQw4w9WgXcQ",
      title: { runs: [{ text: "A video" }] },
    });
    expect(v?.feedback).toBeUndefined();
  });
});
