import type { AdaptiveFormat } from "../stream";
import { chooseAudioTrack } from "./stream";

const f = (id: string, displayName: string, audioIsDefault = false) =>
  ({ audioTrack: { id, displayName, audioIsDefault } }) as AdaptiveFormat;

const formats = [
  f("hi.4", "Hindi", true),
  f("en.4", "English original"),
  f("de.4", "German"),
];

test("the original language plays unless you ask for YouTube's pick", () => {
  expect(chooseAudioTrack(formats)).toBe("en.4");
  expect(chooseAudioTrack(formats, undefined, false)).toBe("hi.4");
  expect(chooseAudioTrack(formats, "de.4", false)).toBe("de.4");
  expect(
    chooseAudioTrack(
      [f("a", "Dub"), f("b", "Other original")],
      undefined,
      false,
    ),
  ).toBe("b");
});
