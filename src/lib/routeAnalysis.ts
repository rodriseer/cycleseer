import { angleDiffDeg } from "./geo";
import { round1, clamp } from "./units";
import type { SegmentWind } from "./scoring";
import type { RouteSummary, SegmentStats } from "./types";

function cosd(d: number) { return Math.cos((d * Math.PI) / 180); }
function sind(d: number) { return Math.sin((d * Math.PI) / 180); }

export function analyzeWindOnRoute(segWinds: SegmentWind[]): { summary: RouteSummary; segments: SegmentStats[] } {
  const total_m = segWinds.reduce((s, x) => s + x.length_m, 0) || 1;

  let head_m = 0;
  let cross_m = 0;
  let tail_m = 0;

  let sumWind = 0;
  let sumGust = 0;

  let headPosSum = 0;

  const segments: SegmentStats[] = [];

  for (const s of segWinds) {
    const diff = angleDiffDeg(s.heading, s.wind_from_deg);
    const headComp = s.wind_mps * cosd(diff);          // + head, - tail
    const crossComp = Math.abs(s.wind_mps * sind(diff)); // magnitude

    sumWind += s.wind_mps * s.length_m;
    sumGust += s.gust_mps * s.length_m;

    if (headComp > 0.75) head_m += s.length_m;
    else if (headComp < -0.75) tail_m += s.length_m;
    else cross_m += s.length_m;

    headPosSum += Math.max(0, headComp) * s.length_m;

    segments.push({
      heading_deg: s.heading,
      length_m: s.length_m,
      wind_mps: s.wind_mps,
      gust_mps: s.gust_mps,
      wind_from_deg: s.wind_from_deg,
      headComp_mps: headComp,
      crossComp_mps: crossComp,
    });
  }

  const pct = (m: number) => clamp((m / total_m) * 100, 0, 100);

  const summary: RouteSummary = {
    distance_m: total_m,
    headwind_pct: round1(pct(head_m)),
    crosswind_pct: round1(pct(cross_m)),
    tailwind_pct: round1(pct(tail_m)),
    avg_headwind_mps: round1(headPosSum / total_m),
    avg_wind_mps: round1(sumWind / total_m),
    avg_gust_mps: round1(sumGust / total_m),
  };

  return { summary, segments };
}
