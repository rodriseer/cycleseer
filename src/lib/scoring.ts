import { LatLng, bearingDeg, haversineMeters, angleDiffDeg } from "./geo";
import { clamp, round1 } from "./units";
import type { PenaltyBreakdown, RideScore, RideScoreLabel } from "./types";

export type SegmentWind = {
  heading: number;
  length_m: number;
  wind_mps: number;
  gust_mps: number;
  wind_from_deg: number;
};

export type WindScoreResult = {
  windScore10: number;
  headwindIndex: number;
  gustExposureIndex: number;
  tailwindFinishBonus: number;
  notes: string[];
};

function cosd(d: number) { return Math.cos((d * Math.PI) / 180); }
function sind(d: number) { return Math.sin((d * Math.PI) / 180); }

export function buildSegments(points: LatLng[]): { heading: number; length_m: number; mid: LatLng }[] {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = haversineMeters(a, b);
    if (len < 10) continue;
    const head = bearingDeg(a, b);
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    segs.push({ heading: head, length_m: len, mid });
  }
  return segs;
}

export function scoreWindAlongRoute(segWinds: SegmentWind[]): WindScoreResult {
  const total_m = segWinds.reduce((s, x) => s + x.length_m, 0) || 1;

  // penalties accumulate in "m/s * km" space
  let headPenalty = 0;
  let tailBonus = 0;
  let gustPenalty = 0;

  // finish bonus: only last 30% of distance
  const finishStart_m = total_m * 0.7;
  let cum_m = 0;
  let finishTail = 0;

  // thresholds (tunable)
  const TAIL_CAP = 7.5;          // m/s
  const GUST_TRIGGER = 12;       // m/s
  const CROSS_BAND_MIN = 70;     // deg
  const CROSS_BAND_MAX = 110;    // deg

  for (const s of segWinds) {
    const seg_km = s.length_m / 1000;
    const diff = angleDiffDeg(s.heading, s.wind_from_deg);

    // + = headwind component (wind from ahead)
    const headComp = s.wind_mps * cosd(diff);     // headwind if diff ~ 0
    const tailComp = Math.max(0, -headComp);
    const headCompPos = Math.max(0, headComp);

    headPenalty += headCompPos * seg_km;

    // small tailwind reward, capped
    tailBonus += Math.min(tailComp, TAIL_CAP) * seg_km * 0.35;

    // gust crosswind exposure
    const crossFactor = Math.abs(sind(diff)); // 0 head/tail, 1 cross
    const isCrossBand = diff >= CROSS_BAND_MIN && diff <= CROSS_BAND_MAX;

    if (isCrossBand && s.gust_mps > GUST_TRIGGER && crossFactor > 0.75) {
      gustPenalty += (s.gust_mps - GUST_TRIGGER) * crossFactor * seg_km * 0.9;
    }

    // finish tailwind bonus
    const prev = cum_m;
    cum_m += s.length_m;
    if (cum_m > finishStart_m) {
      const overlap_m = Math.min(cum_m, total_m) - Math.max(prev, finishStart_m);
      const overlap_km = Math.max(0, overlap_m) / 1000;
      // same tail but slightly stronger effect on finish
      finishTail += Math.min(tailComp, TAIL_CAP) * overlap_km;
    }
  }

  // convert to indexes
  const headwindIndex = headPenalty;             // higher = worse
  const gustExposureIndex = gustPenalty;         // higher = worse
  const tailwindFinishBonus = finishTail * 0.6;  // higher = better

  // windEffort: bigger is worse
  const windEffort = headPenalty + gustPenalty - tailBonus - tailwindFinishBonus;

  // Normalize to 0..10
  // scale chosen so typical 20mi rides land in a meaningful range
  const SCALE = 10.5;
  const windScore10 = clamp(10 - windEffort / SCALE, 0, 10);

  // Notes
  const notes: string[] = [];
  if (windScore10 >= 8.2) notes.push("Wind looks favorable for most of the route.");
  else if (windScore10 >= 6.5) notes.push("Manageable wind with a few exposed stretches.");
  else notes.push("Wind will add effort—expect tougher segments.");

  if (tailwindFinishBonus > 2.0) notes.push("Tailwind finish likely in the last third.");
  if (gustExposureIndex > 3.0) notes.push("Gusty crosswind exposure on open segments.");

  return {
    windScore10: round1(windScore10),
    headwindIndex: round1(headwindIndex),
    gustExposureIndex: round1(gustExposureIndex),
    tailwindFinishBonus: round1(tailwindFinishBonus),
    notes,
  };
}

function labelForScore100(score100: number): RideScoreLabel {
  if (score100 >= 85) return "Great";
  if (score100 >= 70) return "Good";
  if (score100 < 50) return "Skip";
  return "Meh";
}

/**
 * Convert route-specific wind result + current hour weather into an overall 0..100 ride score.
 * Elevation is a placeholder (0) until you add elevation sampling.
 */
export function scoreRideOverall(opts: {
  wind: WindScoreResult;
  // current hour weather (optional)
  temp_c?: number | null;
  precip_prob?: number | null; // 0..100
  rideType?: "road" | "gravel";
  elevationPenalty?: number; // 0..100 (optional; default 0)
}): RideScore {
  const rideType = opts.rideType ?? "road";

  // Wind penalty (inverts windScore10)
  // 10 => 0 penalty, 0 => 70 penalty
  const windPenalty = clamp((10 - opts.wind.windScore10) / 10 * 70, 0, 70);

  // Gust penalty: based on gustExposureIndex; gravel is more sensitive
  const gustScale = rideType === "gravel" ? 13 : 10;
  const gustPenalty = clamp((opts.wind.gustExposureIndex / gustScale) * 30, 0, 30);

  // Weather penalty
  let weatherPenalty = 0;
  const notes = [...opts.wind.notes];

  const p = opts.precip_prob;
  if (typeof p === "number") {
    const pp = clamp(p, 0, 100);
    weatherPenalty += (pp / 100) * 25;
    if (pp >= 50) notes.push("Rain chance is noticeable.");
  }

  const t = opts.temp_c;
  if (typeof t === "number") {
    // comfort band 10..24 C
    const cold = Math.max(0, 10 - t);
    const hot = Math.max(0, t - 24);
    weatherPenalty += clamp(cold * 1.8 + hot * 1.2, 0, 20);
  }

  const elevationPenalty = clamp(opts.elevationPenalty ?? 0, 0, 30);

  // Total penalty and score
  const totalPenalty = clamp(windPenalty + gustPenalty + weatherPenalty + elevationPenalty, 0, 100);
  const score100 = Math.round(100 - totalPenalty);
  const label = labelForScore100(score100);

  const penalties: PenaltyBreakdown = {
    wind: Math.round(clamp((windPenalty / 70) * 100, 0, 100)),
    gusts: Math.round(clamp((gustPenalty / 30) * 100, 0, 100)),
    weather: Math.round(clamp((weatherPenalty / 45) * 100, 0, 100)),
    elevation: Math.round(clamp((elevationPenalty / 30) * 100, 0, 100)),
  };

  // Add a short decision note
  if (label === "Great") notes.push("This looks like a strong outdoor ride window.");
  else if (label === "Skip") notes.push("Consider shifting time or choosing a sheltered route.");

  return {
    score100,
    label,
    windScore10: round1(opts.wind.windScore10),
    penalties,
    notes,
  };
}
