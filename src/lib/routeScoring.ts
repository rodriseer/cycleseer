function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = (v - inMin) / (inMax - inMin);
  return outMin + clamp(t, 0, 1) * (outMax - outMin);
}

export type RideMode =
  | "scenic"
  | "training"
  | "commute"
  | "flat_fast"
  | "climbing_focus";

export type RouteScore = {
  total: number; // 0..10
  factors: {
    efficiency: number;
    climbing: number;
    safety_proxy: number;
  };
  summary: string;
  mode: RideMode;
  modeLabel: string;
  modeDescription: string;
};

type RideModeConfig = {
  id: RideMode;
  label: string;
  description: string;
};

export const RIDE_MODES: RideModeConfig[] = [
  {
    id: "scenic",
    label: "Scenic",
    description: "Optimized for smoother, lower‑stress scenic rides.",
  },
  {
    id: "training",
    label: "Training",
    description: "Optimized for longer, hillier training days.",
  },
  {
    id: "commute",
    label: "Commute",
    description: "Optimized for efficient, lower‑effort daily rides.",
  },
  {
    id: "flat_fast",
    label: "Flat & Fast",
    description: "Optimized for flatter, direct, speed‑focused routes.",
  },
  {
    id: "climbing_focus",
    label: "Climbing Focus",
    description: "Optimized for climbing performance and vertical gain.",
  },
];

const RIDE_MODE_BY_ID: Record<RideMode, RideModeConfig> = RIDE_MODES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<RideMode, RideModeConfig>
);

/**
 * Baseline 0..10 score using distance, time and total gain, with
 * a small “ride mode” layer on top so different preferences can
 * bias the weighting without changing the underlying factors.
 */
export function scoreRoute(
  distance_m: number,
  duration_s: number,
  gain_m: number,
  mode: RideMode = "scenic"
): RouteScore {
  const distance_km = distance_m / 1000;
  const hours = Math.max(0.25, duration_s / 3600);
  const speed_kmh = distance_km / hours;

  // Time efficiency: 10–28 km/h → 3–10 band
  const efficiency = clamp(mapRange(speed_kmh, 10, 28, 3, 10), 0, 10);

  // Elevation: more gain per km reduces score
  const gainPerKm = gain_m / Math.max(1, distance_km);
  const climbing = clamp(10 - mapRange(gainPerKm, 10, 60, 0, 7), 0, 10);

  // Simple safety/comfort proxy: longer + hillier = harsher
  const safety_proxy = clamp(
    10 -
      mapRange(distance_km, 3, 40, 0, 6) -
      mapRange(gainPerKm, 10, 80, 0, 3),
    0,
    10
  );

  // Extra “intensity” knobs so training / climbing modes can prefer
  // more elevation and distance without duplicating components.
  const intensityClimb = clamp(mapRange(gainPerKm, 15, 90, 3, 10), 0, 10);
  const distanceScore = clamp(mapRange(distance_km, 3, 45, 3, 10), 0, 10);

  let totalBase: number;

  switch (mode) {
    case "scenic": {
      // Scenic:
      // - Prefer smoother, moderate routes.
      // - Heavier weight on comfort, moderate elevation.
      totalBase =
        0.25 * efficiency +
        0.2 * distanceScore +
        0.35 * safety_proxy +
        0.2 * climbing;
      break;
    }
    case "training": {
      // Training:
      // - Reward elevation gain and longer distance.
      // - Slightly penalize very flat routes.
      totalBase =
        0.25 * efficiency +
        0.15 * safety_proxy +
        0.35 * intensityClimb +
        0.25 * distanceScore;
      break;
    }
    case "commute": {
      // Commute:
      // - Prioritize efficiency and keeping effort reasonable.
      // - Penalize excessive elevation via higher reliance on climbing ease.
      totalBase =
        0.55 * efficiency +
        0.25 * safety_proxy +
        0.2 * climbing;
      break;
    }
    case "flat_fast": {
      // Flat & Fast:
      // - Heavily penalize elevation gain (via climbing ease).
      // - Prioritize direct, speed‑feeling routes.
      totalBase =
        0.6 * efficiency +
        0.3 * climbing +
        0.1 * safety_proxy;
      break;
    }
    case "climbing_focus": {
      // Climbing Focus:
      // - Strongly reward vertical gain and distance.
      // - Overall efficiency and comfort matter less.
      totalBase =
        0.15 * efficiency +
        0.1 * safety_proxy +
        0.5 * intensityClimb +
        0.25 * distanceScore;
      break;
    }
    default: {
      // Fallback to the original balanced weighting.
      totalBase =
        0.5 * efficiency +
        0.35 * climbing +
        0.15 * safety_proxy;
      break;
    }
  }

  const total = clamp(totalBase, 0, 10);

  const summary =
    total >= 8
      ? "Fast‑feeling outdoor ride for this mode."
      : total >= 6
        ? "Solid ride for this mode. Some effort, but worth it."
        : "Challenging ride for this mode. Expect more grind or elevation.";

  const meta = RIDE_MODE_BY_ID[mode];

  return {
    total,
    factors: { efficiency, climbing, safety_proxy },
    summary,
    mode,
    modeLabel: meta.label,
    modeDescription: meta.description,
  };
}

