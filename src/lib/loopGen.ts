import { LatLng, destination } from "./geo";

export type LoopCandidateConfig = {
  baseBearing: number;
  delta: number;
  clockwise: boolean;
  r1: number; // meters
  r2: number; // meters
};

function jitter(n: number, pct: number) {
  const span = n * pct;
  return n + (Math.random() * 2 - 1) * span;
}

function jitterAngle(deg: number, max: number) {
  return (deg + (Math.random() * 2 - 1) * max + 360) % 360;
}

export function makeWindBiasedConfigs(
  windFromDeg: number,
  targetMeters: number
): LoopCandidateConfig[] {
  // target loop ~ 2πr-ish; use a radius estimate, then we vary it
  const rBase = Math.max(1500, (targetMeters / (2 * Math.PI)) * 0.95); // meters

  const downwind = (windFromDeg + 180) % 360;
  const upwind = windFromDeg;

  const offsets = [0, 20, 40];
  const deltas = [55, 75, 95];

  const bases: number[] = [];
  for (const o of offsets) {
    bases.push((downwind + o) % 360, (downwind - o + 360) % 360);
    bases.push((upwind + o) % 360, (upwind - o + 360) % 360);
  }

  const configs: LoopCandidateConfig[] = [];
  for (const base of bases) {
    for (const d of deltas) {
      for (const clockwise of [true, false]) {
        configs.push({
          baseBearing: base,
          delta: d,
          clockwise,
          r1: jitter(rBase, 0.12),
          r2: jitter(rBase, 0.12),
        });
      }
    }
  }

  // Add small variety
  return configs.slice(0, 24).map((c) => ({
    ...c,
    baseBearing: jitterAngle(c.baseBearing, 6),
    delta: jitterAngle(c.delta, 6),
  }));
}

export function configToWaypoints(start: LatLng, c: LoopCandidateConfig): LatLng[] {
  const A = destination(start, c.baseBearing, c.r1);
  const bBearing = c.clockwise
    ? (c.baseBearing + c.delta) % 360
    : (c.baseBearing - c.delta + 360) % 360;
  const B = destination(start, bBearing, c.r2);
  return [start, A, B, start];
}