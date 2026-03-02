export type LatLng = { lat: number; lng: number };

export type SegmentStats = {
  heading_deg: number;
  length_m: number;
  wind_mps: number;
  gust_mps: number;
  wind_from_deg: number;
  headComp_mps: number; // + = headwind, - = tailwind
  crossComp_mps: number; // magnitude
};

export type RouteSummary = {
  distance_m: number;
  duration_s?: number;
  headwind_pct: number; // 0..100
  crosswind_pct: number; // 0..100
  tailwind_pct: number; // 0..100
  avg_headwind_mps: number; // average over distance (only positive headwind)
  avg_wind_mps: number;
  avg_gust_mps: number;
};

export type PenaltyBreakdown = {
  wind: number;      // 0..100 (higher = worse)
  gusts: number;     // 0..100
  weather: number;   // 0..100
  elevation: number; // 0..100 (placeholder for now)
};

export type RideScoreLabel = "Great" | "Good" | "Meh" | "Skip";

export type RideScore = {
  score100: number;           // 0..100 (higher = better)
  label: RideScoreLabel;
  windScore10: number;        // 0..10 (your existing metric)
  penalties: PenaltyBreakdown;
  notes: string[];
};

export type TimeWindow = {
  startISO: string; // hour ISO like 2026-03-01T14:00
  endISO: string;   // hour ISO like 2026-03-01T16:00
  score100: number;
  label: RideScoreLabel;
};

export type DirectionRecommendation =
  | "Current direction is better (wind-wise)."
  | "Reverse direction recommended (better wind)."
  | "Either direction is similar (wind-wise).";
