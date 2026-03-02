function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = (v - inMin) / (inMax - inMin);
  return outMin + clamp(t, 0, 1) * (outMax - outMin);
}

export type RouteScore = {
  total: number; // 0..10
  factors: {
    efficiency: number;
    climbing: number;
    safety_proxy: number;
  };
  summary: string;
};

/**
 * Baseline 0..10 score using distance, time and total gain.
 * Kept close to the existing behaviour, but centralized so it
 * can be tuned and reused by multiple APIs.
 */
export function scoreRoute(
  distance_m: number,
  duration_s: number,
  gain_m: number
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

  const total = clamp(
    0.5 * efficiency + 0.35 * climbing + 0.15 * safety_proxy,
    0,
    10
  );

  const summary =
    total >= 8
      ? "Fast-feeling outdoor ride. Great pick."
      : total >= 6
        ? "Solid ride. Some effort or elevation, but worth it."
        : "Challenging ride. Expect slower pace or more climbing.";

  return { total, factors: { efficiency, climbing, safety_proxy }, summary };
}

