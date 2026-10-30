import {
  blink,
  calmPose,
  DANCE,
  dancePose,
  driftAt,
  type Live,
  newRig,
  type Profile,
  profileFor,
  REST,
  SLEEP,
  sleepPose,
  STRETCH,
  stepRig,
  stretchPose,
} from "./rig";

const live: Live = { beatMs: 500, amp: 1, onsetAt: 0, locked: false };

function run(p: Profile, ms: number, l: Live = live, from = newRig()) {
  let s = from;
  for (let t = 16; t <= ms; t += 16) s = stepRig(s, p, l, 16, p.at + t);
  return s;
}

describe("dancePose", () => {
  it("crouches before the hop and lands squashed", () => {
    const crouch = dancePose(0, 1);
    expect(crouch.sy).toBeLessThan(1);
    expect(crouch.sx).toBeGreaterThan(1);
    expect(dancePose(0.5, 1).sy).toBeLessThan(1);
  });

  it("stretches in the air, tilting a different way each beat", () => {
    const first = dancePose(0.25, 1);
    const second = dancePose(0.75, 1);
    expect(first.y).toBeLessThan(-8);
    expect(first.sy).toBeGreaterThan(1);
    expect(dancePose(0.1, 1).rot).toBeLessThan(0);
    expect(dancePose(0.6, 1).rot).toBeGreaterThan(0);
    expect(second.y).toBeCloseTo(first.y);
  });

  it("hops less for a quiet song", () => {
    expect(Math.abs(dancePose(0.25, 0).y)).toBeLessThan(
      Math.abs(dancePose(0.25, 1).y) / 3,
    );
  });

  it("thumps the cups on each beat and lets go", () => {
    expect(dancePose(0, 1).cup).toBeCloseTo(1.14);
    expect(dancePose(0.5, 1).cup).toBeCloseTo(1.14);
    expect(dancePose(0.3, 1).cup).toBe(1);
  });

  it("moves the ears a moment after the body", () => {
    const body = dancePose(0.25, 1);
    const later = dancePose(0.25 + 0.075, 1);
    expect(Math.abs(later.earL)).toBeGreaterThan(Math.abs(body.earL) - 0.01);
    expect(body.earL).toBeLessThan(0);
  });

  it("keeps the shadow tied to the height", () => {
    expect(dancePose(0, 1).lift).toBe(0);
    expect(dancePose(0.25, 1).lift).toBe(1);
  });
});

describe("sleepPose", () => {
  it("breathes in and out", () => {
    const a = sleepPose(0);
    const b = sleepPose(2300);
    expect(b.sy).toBeGreaterThan(a.sy);
    expect(b.sx).toBeLessThan(a.sx);
  });

  it("twitches the right ear only now and then", () => {
    expect(sleepPose(0).earR).toBe(sleepPose(3000).earR);
    expect(sleepPose(0.83 * 7000).earR).toBeGreaterThan(sleepPose(0).earR + 5);
  });
});

describe("blink", () => {
  it("shuts the eyes briefly every few seconds", () => {
    expect(blink(1000)).toBe(1);
    expect(blink(0.95 * 4200)).toBeCloseTo(0.08);
    expect(blink(4200)).toBe(1);
  });
});

describe("stretchPose", () => {
  it("rises and settles back", () => {
    expect(stretchPose(0.5).sy).toBeGreaterThan(1.1);
    expect(stretchPose(0).sy).toBe(1);
    expect(stretchPose(1).sy).toBeCloseTo(1);
  });
});

describe("profileFor", () => {
  it("dances to a groove, sleeps, and stretches on waking", () => {
    expect(profileFor("groove", 520, false, 0).motion).toBe(DANCE);
    expect(profileFor("sleep", 520, false, 0).motion).toBe(SLEEP);
    expect(profileFor("yawn", 520, false, 0).motion).toBe(STRETCH);
  });

  it("holds hype to big hops whatever the song", () => {
    expect(profileFor("hype", 520, true, 0).boost).toBeGreaterThan(0.8);
  });
});

describe("stepRig", () => {
  it("advances the dance at the song's tempo", () => {
    const p = profileFor("groove", 520, true, 0);
    const slow = run(p, 500, { ...live, beatMs: 500 });
    const fast = run(p, 500, { ...live, beatMs: 250 });
    expect(slow.phase).toBeCloseTo(0.5, 1);
    expect(fast.phase).toBeCloseTo(0.99, 1);
  });

  it("uses its own beat when it isn't listening", () => {
    const p = profileFor("groove", 1000, false, 0);
    expect(run(p, 500, { ...live, beatMs: 250 }).phase).toBeCloseTo(0.25, 1);
  });

  it("nudges the beat onto a kick only once the tempo is trusted", () => {
    const p = profileFor("groove", 500, true, 0);
    const warm = run(p, 160, { ...live, locked: true });
    const kicked = stepRig(
      warm,
      p,
      { ...live, locked: true, onsetAt: 1 },
      16,
      176,
    );
    const ignored = stepRig(
      warm,
      p,
      { ...live, locked: false, onsetAt: 1 },
      16,
      176,
    );
    const beat = (phase: number) => (phase * 2) % 1;
    expect(Math.abs(beat(kicked.phase))).toBeLessThan(
      Math.abs(beat(ignored.phase)),
    );
  });

  it("blends into a new mood instead of jumping", () => {
    const sleeping = run(profileFor("sleep", 520, false, 0), 800);
    const woke = profileFor("groove", 520, false, 900);
    const first = stepRig(sleeping, woke, live, 16, 916);
    const settled = run(woke, 400, live, sleeping);
    expect(Math.abs(first.pose.rot - sleeping.pose.rot)).toBeLessThan(2);
    expect(settled.pose.rot).not.toBeCloseTo(-5);
  });

  it("leaves a still mood at rest apart from blinking", () => {
    const s = run(profileFor("meow", 520, false, 0), 500);
    expect(s.pose).toEqual({ ...REST, nt: s.pose.nt, eye: s.pose.eye });
  });
});

describe("driftAt", () => {
  it("staggers the floating notes and Zs", () => {
    expect(driftAt(0, 0, false)).toBe(0);
    expect(driftAt(0, 1, false)).toBeCloseTo(0.325);
    expect(driftAt(0.9, 2, true)).toBeCloseTo(0.567, 2);
  });
});

describe("calmPose", () => {
  it("is a settled pose for reduced motion", () => {
    expect(calmPose(profileFor("groove", 520, false, 0))).toEqual(REST);
    expect(calmPose(profileFor("sleep", 520, false, 0)).rot).toBe(-5);
  });
});
