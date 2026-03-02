import { pickHourIndex, fetchHourlyWXAt } from "./weather";
import { clamp, round1 } from "./units";
import type { LatLng } from "./geo";
import type { TimeWindow, RideScoreLabel } from "./types";

/**
 * Simple (route-agnostic) "ride quality" score for a single hour.
 * 100 = best, 0 = worst.
 */
export function scoreHourGeneral(opts: {
  wind_mps: number;
  gust_mps: number;
  temp_c: number | null;
  precip_prob: number | null;
}): { score100: number; label: RideScoreLabel; notes: string[]; penalties: { wind: number; gusts: number; weather: number } } {
  const notes: string[] = [];

  const wind = Math.max(0, opts.wind_mps);
  const gust = Math.max(0, opts.gust_mps);

  // Wind penalty: 0 at <= 2 m/s, ramps to heavy at 12 m/s+
  const windPenalty = clamp(((wind - 2) / 10) * 55, 0, 55);

  // Gust penalty: based on gust spread + absolute gust
  const spread = Math.max(0, gust - wind);
  const gustPenalty = clamp(((spread - 2) / 8) * 25 + ((gust - 10) / 10) * 15, 0, 35);

  // Weather penalty: precip probability and uncomfortable temps
  let weatherPenalty = 0;
  const p = opts.precip_prob;
  if (typeof p === "number") {
    weatherPenalty += clamp((p / 100) * 25, 0, 25);
    if (p >= 50) notes.push("Rain chance is noticeable.");
  }

  const t = opts.temp_c;
  if (typeof t === "number") {
    // comfort band 10..24 C
    const cold = Math.max(0, 10 - t);
    const hot = Math.max(0, t - 24);
    weatherPenalty += clamp(cold * 1.8 + hot * 1.2, 0, 20);
  }

  const totalPenalty = clamp(windPenalty + gustPenalty + weatherPenalty, 0, 100);
  const score100 = Math.round(clamp(100 - totalPenalty, 0, 100));

  let label: RideScoreLabel = "Meh";
  if (score100 >= 85) label = "Great";
  else if (score100 >= 70) label = "Good";
  else if (score100 < 50) label = "Skip";

  if (wind <= 4) notes.push("Light wind.");
  else if (wind <= 8) notes.push("Moderate wind.");
  else notes.push("Windy hour.");

  if (spread >= 6) notes.push("Gusts are jumpy.");

  return {
    score100,
    label,
    notes,
    penalties: {
      wind: Math.round(clamp((windPenalty / 55) * 100, 0, 100)),
      gusts: Math.round(clamp((gustPenalty / 35) * 100, 0, 100)),
      weather: Math.round(clamp((weatherPenalty / 45) * 100, 0, 100)),
    },
  };
}

/**
 * Finds best rolling N-hour windows in the next horizonHours.
 * Uses Open-Meteo at a point (start or midpoint).
 */
export async function bestWindowsAtPoint(opts: {
  p: LatLng;
  tz: string;
  startHourISO: string; // "YYYY-MM-DDTHH:00"
  windowHours?: number; // default 2
  horizonHours?: number; // default 24
  topK?: number; // default 3
}): Promise<TimeWindow[]> {
  const { p, tz, startHourISO } = opts;
  const windowHours = opts.windowHours ?? 2;
  const horizonHours = opts.horizonHours ?? 24;
  const topK = opts.topK ?? 3;

  const wx = await fetchHourlyWXAt(p, tz);
  const startIdx = pickHourIndex(wx.times, startHourISO);

  const endIdx = Math.min(wx.times.length, startIdx + horizonHours);

  const perHour = [];
  for (let i = startIdx; i < endIdx; i++) {
    const s = scoreHourGeneral({
      wind_mps: wx.wind_mps[i],
      gust_mps: wx.gust_mps[i],
      temp_c: wx.temp_c[i] ?? null,
      precip_prob: wx.precip_prob[i] ?? null,
    });
    perHour.push({ i, ...s });
  }

  const windows: TimeWindow[] = [];
  for (let k = 0; k + windowHours <= perHour.length; k++) {
    const slice = perHour.slice(k, k + windowHours);
    const score = Math.round(slice.reduce((a, b) => a + b.score100, 0) / slice.length);
    // label based on score
    let label: RideScoreLabel = "Meh";
    if (score >= 85) label = "Great";
    else if (score >= 70) label = "Good";
    else if (score < 50) label = "Skip";

    const startISO = wx.times[slice[0].i];
    const endISO = wx.times[slice[slice.length - 1].i].slice(0, 13) + ":00";

    windows.push({ startISO, endISO, score100: score, label });
  }

  windows.sort((a, b) => b.score100 - a.score100);

  // de-dup heavily overlapping starts (keep distinct)
  const picked: TimeWindow[] = [];
  const seen = new Set<string>();
  for (const w of windows) {
    const key = w.startISO;
    if (seen.has(key)) continue;
    picked.push(w);
    seen.add(key);
    if (picked.length >= topK) break;
  }
  return picked;
}
