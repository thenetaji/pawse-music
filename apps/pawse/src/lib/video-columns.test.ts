import { videoColumns } from "./video-columns";

describe("videoColumns", () => {
  it("keeps phones to one column", () => {
    expect(videoColumns(390)).toBe(1);
  });

  it.each([1280, 1920, 2560, 3840])(
    "keeps tiles from growing huge at %i px",
    (width) => {
      const tile = (width - 16) / videoColumns(width) - 16;
      expect(tile).toBeGreaterThanOrEqual(280);
      expect(tile).toBeLessThanOrEqual(480);
    },
  );
});
