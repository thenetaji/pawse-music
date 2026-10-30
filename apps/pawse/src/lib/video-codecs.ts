import { Platform } from "react-native";

import { useLibrary } from "../data/library";

// YouTube's H.264 stops at 1080p; 1440p and 4K come as AV1, which only some players decode in hardware.
const AV1 = 'video/mp4; codecs="av01.0.12M.08"';

// The browser knows whether its AV1 is hardware (efficient) decoding; software AV1 at 4K would stutter.
let browserAv1 = false;
if (
  Platform.OS === "web" &&
  typeof navigator !== "undefined" &&
  typeof MediaSource !== "undefined" &&
  MediaSource.isTypeSupported(AV1)
) {
  navigator.mediaCapabilities
    ?.decodingInfo({
      type: "media-source",
      video: {
        contentType: AV1,
        width: 3840,
        height: 2160,
        bitrate: 20_000_000,
        framerate: 30,
      },
    })
    .then((i) => {
      browserAv1 = i.supported && i.smooth && i.powerEfficient;
    })
    .catch(() => {});
}

/** Whether 1440p and 4K (AV1) are offered. The browser says for itself; the phone apps have no way to ask
 * the hardware, so it's the "Higher qualities (AV1)" setting, off until you turn it on. */
export const higherQualities = (): boolean =>
  Platform.OS === "web"
    ? browserAv1
    : !!useLibrary.getState().settings.videoHigher;
