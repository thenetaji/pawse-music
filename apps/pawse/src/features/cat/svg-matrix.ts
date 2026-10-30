import { Platform } from "react-native";
import type { GProps } from "react-native-svg";

import type { Pose } from "./rig";

// [a, b, c, d, e, f] as in SVG's matrix(): x' = a x + c y + e, y' = b x + d y + f.
type Matrix = number[];

const WEB = Platform.OS === "web";

/** The body's hop: squash about the feet, then tilt, then lift. */
export function bodyMatrix(p: Pose, ox = 60, oy = 104): Matrix {
  "worklet";
  const r = (p.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = cos * p.sx;
  const b = sin * p.sx;
  const c = -sin * p.sy;
  const d = cos * p.sy;
  return [a, b, c, d, ox - (a * ox + c * oy), oy + p.y - (b * ox + d * oy)];
}

export function rotateAbout(deg: number, ox: number, oy: number): Matrix {
  "worklet";
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    cos,
    sin,
    -sin,
    cos,
    ox - (cos * ox - sin * oy),
    oy - (sin * ox + cos * oy),
  ];
}

export function scaleAbout(
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): Matrix {
  "worklet";
  return [sx, 0, 0, sy, ox * (1 - sx), oy * (1 - sy)];
}

/** Turns by `deg` where the shape sits, then moves it. */
export function turnAndMove(deg: number, x: number, y: number): Matrix {
  "worklet";
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, x, y];
}

/**
 * A matrix as animated props. The native SVG views take `matrix`; the web
 * ones take a `transform` attribute. Updated this way no JS runs per frame.
 */
export function matrixProps(m: Matrix): Pick<GProps, "transform"> {
  "worklet";
  return (
    WEB ? { transform: `matrix(${m.join(" ")})` } : { matrix: m }
  ) as Pick<GProps, "transform">;
}
