import { equalPowerGain } from "./fade";

describe("equalPowerGain", () => {
  it("runs from full volume to silence", () => {
    expect(equalPowerGain(10, 10)).toBeCloseTo(1);
    expect(equalPowerGain(0, 10)).toBeCloseTo(0);
  });
  it("is 3 dB down halfway", () => {
    expect(equalPowerGain(5, 10)).toBeCloseTo(Math.SQRT1_2);
  });
  it("keeps total power constant against its mirror", () => {
    const g = equalPowerGain(3, 10);
    const mirror = equalPowerGain(7, 10);
    expect(g * g + mirror * mirror).toBeCloseTo(1);
  });
  it("stays in range outside the fade", () => {
    expect(equalPowerGain(-4, 10)).toBeCloseTo(0);
    expect(equalPowerGain(40, 10)).toBeCloseTo(1);
    expect(equalPowerGain(1, 0)).toBe(1);
  });
});
