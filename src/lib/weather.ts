import { weatherCache } from "./cache";
import { LatLng } from "./geo";

export type HourWind = {
  time: string; // "YYYY-MM-DDTHH:00"
  wind_mps: number;
  gust_mps: number;
  wind_from_deg: number;
};

export type HourWX = HourWind & {
  temp_c: number | null;
  precip_prob: number | null; // 0..100
};

function roundCoord(n: number) {
  return Math.round(n * 100) / 100; // 2 decimals cache bucket
}

/**
 * Wind-only hourly forecast (kept for backwards compatibility).
 * Uses Open-Meteo.
 */
export async function fetchHourlyWindAt(
  p: LatLng,
  tz: string
): Promise<{ times: string[]; wind_mps: number[]; gust_mps: number[]; wind_from_deg: number[] }> {
  const lat = roundCoord(p.lat);
  const lng = roundCoord(p.lng);

  const cacheKey = `om:wind:${lat},${lng}:${tz}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=windspeed_10m,windgusts_10m,winddirection_10m` +
    `&windspeed_unit=ms` +
    `&timezone=${encodeURIComponent(tz)}`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Open-Meteo fetch failed");
  const j = await r.json();

  const out = {
    times: j.hourly.time as string[],
    wind_mps: j.hourly.windspeed_10m as number[],
    gust_mps: j.hourly.windgusts_10m as number[],
    wind_from_deg: j.hourly.winddirection_10m as number[],
  };

  weatherCache.set(cacheKey, out);
  return out;
}

/**
 * Hourly forecast including wind + temperature + precip probability.
 * temp/precip can be null if the API doesn't return them (rare).
 */
export async function fetchHourlyWXAt(
  p: LatLng,
  tz: string
): Promise<{
  times: string[];
  wind_mps: number[];
  gust_mps: number[];
  wind_from_deg: number[];
  temp_c: (number | null)[];
  precip_prob: (number | null)[];
}> {
  const lat = roundCoord(p.lat);
  const lng = roundCoord(p.lng);

  const cacheKey = `om:wx:${lat},${lng}:${tz}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=windspeed_10m,windgusts_10m,winddirection_10m,temperature_2m,precipitation_probability` +
    `&windspeed_unit=ms` +
    `&timezone=${encodeURIComponent(tz)}`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Open-Meteo fetch failed");
  const j = await r.json();

  const out = {
    times: j.hourly.time as string[],
    wind_mps: j.hourly.windspeed_10m as number[],
    gust_mps: j.hourly.windgusts_10m as number[],
    wind_from_deg: j.hourly.winddirection_10m as number[],
    temp_c: ((j.hourly.temperature_2m ?? []) as number[]).map((x: any) =>
      typeof x === "number" && Number.isFinite(x) ? x : null
    ),
    precip_prob: ((j.hourly.precipitation_probability ?? []) as number[]).map((x: any) =>
      typeof x === "number" && Number.isFinite(x) ? x : null
    ),
  };

  // Ensure same length arrays (defensive)
  const n = out.times.length;
  if (out.temp_c.length !== n) out.temp_c = new Array(n).fill(null);
  if (out.precip_prob.length !== n) out.precip_prob = new Array(n).fill(null);

  weatherCache.set(cacheKey, out);
  return out;
}

export function pickHourIndex(times: string[], targetISOHour: string) {
  // targetISOHour example: "2026-03-01T14:00"
  const idx = times.indexOf(targetISOHour);
  if (idx >= 0) return idx;

  // fallback: match by prefix "YYYY-MM-DDTHH:"
  const prefix = targetISOHour.slice(0, 13);
  const idx2 = times.findIndex((t) => t.slice(0, 13) === prefix);
  return idx2 >= 0 ? idx2 : 0;
}
