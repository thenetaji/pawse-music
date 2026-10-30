import { bodyMatrix, rotateAbout, scaleAbout, turnAndMove } from "./svg-matrix";
import { REST } from "./rig";

const apply = (m: number[], x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

describe("svg matrices", () => {
  it("keeps a point on the pivot where it was", () => {
    expect(apply(rotateAbout(30, 40, 46), 40, 46)).toEqual([40, 46]);
    const s = apply(scaleAbout(1.14, 1.14, 17, 70), 17, 70);
    expect(s[0]).toBeCloseTo(17);
    expect(s[1]).toBeCloseTo(70);
  });

  it("squashes the body about its feet", () => {
    const m = bodyMatrix({ ...REST, sx: 1.1, sy: 0.9 });
    const [x, y] = apply(m, 60, 104);
    expect(x).toBeCloseTo(60);
    expect(y).toBeCloseTo(104);
    expect(apply(m, 60, 54)[1]).toBeCloseTo(104 - 45);
  });

  it("lifts the body by y and leans the head the way it turns", () => {
    expect(apply(bodyMatrix({ ...REST, y: -11 }), 60, 104)[1]).toBeCloseTo(93);
    const tilted = apply(bodyMatrix({ ...REST, rot: 10 }), 60, 54);
    expect(tilted[0]).toBeGreaterThan(60);
  });

  it("turns a note where it sits, then moves it", () => {
    const [x, y] = apply(turnAndMove(90, 5, -20), 0, 0);
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(-20);
  });
});
