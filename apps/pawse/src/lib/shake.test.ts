import { makeShakeDetector } from "./shake";

const REST = { x: 0, y: 0, z: -1 };
const JOLT = { x: 2.6, y: 0.4, z: -1 };

describe("makeShakeDetector", () => {
  it("ignores a phone at rest and one being carried", () => {
    const shaken = makeShakeDetector();
    let fired = false;
    for (let t = 0; t < 5000; t += 40)
      fired ||= shaken(
        {
          x: 0.3 * Math.sin(t / 200),
          y: 0.2,
          z: -1.1 + 0.3 * Math.cos(t / 200),
        },
        t,
      );
    expect(fired).toBe(false);
  });

  it("fires on three firm hits close together", () => {
    const shaken = makeShakeDetector();
    expect(shaken(JOLT, 0)).toBe(false);
    expect(shaken(REST, 60)).toBe(false);
    expect(shaken(JOLT, 200)).toBe(false);
    expect(shaken(JOLT, 400)).toBe(true);
  });

  it("does not fire on one bump, however long it rings", () => {
    const shaken = makeShakeDetector();
    const results = [0, 40, 80, 100].map((t) => shaken(JOLT, t));
    expect(results).toEqual([false, false, false, false]);
  });

  it("does not fire when the hits are spread out", () => {
    const shaken = makeShakeDetector();
    expect(shaken(JOLT, 0)).toBe(false);
    expect(shaken(JOLT, 600)).toBe(false);
    expect(shaken(JOLT, 1200)).toBe(false);
  });

  it("waits before it can fire again", () => {
    const shaken = makeShakeDetector();
    [0, 200, 400].forEach((t) => shaken(JOLT, t));
    expect([600, 800, 1000].map((t) => shaken(JOLT, t))).toEqual([
      false,
      false,
      false,
    ]);
    expect([2400, 2600, 2800].map((t) => shaken(JOLT, t))).toEqual([
      false,
      false,
      true,
    ]);
  });
});
