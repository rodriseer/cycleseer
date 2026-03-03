/**
 * Best Time to Ride — modular logic for optimal ride windows.
 * Uses wind (relative to route), temperature, and precipitation.
 * Kept separate from route scoring; can be extended to 3-day outlook.
 */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Wind direction is FROM (meteorology). Route bearing is direction of travel. */
function windTypeRelativeToRoute(routeBearingDeg: number, windFromDeg: number): "tailwind" | "headwind" | "crosswind" {
  const windToDeg = (windFromDeg + 180) % 360;
  let diff = Math.abs(windToDeg - routeBearingDeg);
  if (diff > 180) diff = 360 - diff;
  if (diff <= 35) return "tailwind";
  if (diff >= 145) return "headwind";
  return "crosswind";
}

/** m/s to mph */
function msToMph(ms: number) {
  return ms * 2.23694;
}

/** °C to °F */
function cToF(c: number) {
  return c * 1.8 + 32;
}

export type HourlyWindowInput = {
  times: string[];       // ISO hour "YYYY-MM-DDTHH:00"
  wind_mps: number[];
  wind_from_deg: number[];
  temp_c: (number | null)[];
  precip_prob: (number | null)[];
};

export type BestWindowResult = {
  startTime: string;    // "6:30 AM" local
  endTime: string;      // "8:00 AM"
  startISO: string;
  endISO: string;
  windType: "tailwind" | "headwind" | "crosswind";
  windMph: number;
  tempF: number | null;
  precipProb: number | null;
  summary: string;      // e.g. "Light tailwind • 6 mph" or "Light tailwind • 62°F • Low rain chance"
};

export type ComputeBestRideWindowResult = {
  best: BestWindowResult | null;
  fallbackMessage: string | null;
};

/**
 * Score a single hour for ride quality (0 = worst, 100 = best).
 * Favor tailwind, moderate temp (50–75°F), low wind, low precip.
 */
function scoreHour(opts: {
  wind_mps: number;
  wind_from_deg: number;
  routeBearingDeg: number;
  temp_c: number | null;
  precip_prob: number | null;
}): number {
  const type = windTypeRelativeToRoute(opts.routeBearingDeg, opts.wind_from_deg);
  let score = 100;

  // Wind: prefer lower speed; heavily penalize headwind, slightly favor tailwind
  const windMph = msToMph(opts.wind_mps);
  if (type === "headwind") {
    score -= clamp(windMph * 4, 0, 50);  // strong headwind penalty
  } else if (type === "crosswind") {
    score -= clamp(windMph * 1.5, 0, 25);
  } else {
    score += clamp(10 - windMph * 0.5, 0, 10);  // small tailwind bonus, reduced if very windy
  }
  score -= clamp((windMph - 5) * 0.8, 0, 15);  // prefer lower wind overall

  // Temperature: ideal 50–75°F (10–24°C)
  const t = opts.temp_c;
  if (typeof t === "number") {
    const f = cToF(t);
    if (f < 50) score -= clamp((50 - f) * 0.8, 0, 25);
    else if (f > 75) score -= clamp((f - 75) * 1.2, 0, 35);  // penalize extreme heat more
  }

  // Precipitation
  const p = opts.precip_prob ?? 0;
  score -= clamp((p / 100) * 30, 0, 30);

  return clamp(score, 0, 100);
}

/** Format ISO hour to short time like "6:30 AM" (hour only, no minutes in API so we use :00). */
function formatHourLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const h = d.getHours();
    const am = h < 12;
    const h12 = h % 12 || 12;
    return `${h12}:00 ${am ? "AM" : "PM"}`;
  } catch {
    return iso.slice(11, 16) || "—";
  }
}

/**
 * Compute the best ride window over the next 12–24 hours.
 * Uses wind relative to route, temperature, and precipitation.
 * Modular: no duplicate scoring logic; can be extended to multi-day.
 */
export function computeBestRideWindow(opts: {
  hourly: HourlyWindowInput;
  routeBearingDeg: number;
  windowHours?: number;
  horizonHours?: number;
  nowISO?: string;
}): ComputeBestRideWindowResult {
  const windowHours = opts.windowHours ?? 1.5;
  const horizonHours = opts.horizonHours ?? 24;
  const nowISO = opts.nowISO ?? new Date().toISOString().slice(0, 13) + ":00";
  const { hourly, routeBearingDeg } = opts;

  const times = hourly.times;
  if (!times?.length) {
    return { best: null, fallbackMessage: "No forecast data available." };
  }

  // Start from current hour (or next hour if we're past :00)
  let startIdx = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= nowISO) {
      startIdx = i;
      break;
    }
  }

  const endIdx = Math.min(times.length, startIdx + horizonHours);
  const numSlots = Math.max(1, Math.round(windowHours));  // 1.5 -> 2 slots

  let bestScore = -1;
  let bestStartIdx = -1;

  for (let k = startIdx; k + numSlots <= endIdx; k++) {
    let sum = 0;
    for (let j = 0; j < numSlots; j++) {
      const i = k + j;
      sum += scoreHour({
        wind_mps: hourly.wind_mps[i] ?? 0,
        wind_from_deg: hourly.wind_from_deg[i] ?? 0,
        routeBearingDeg,
        temp_c: hourly.temp_c[i] ?? null,
        precip_prob: hourly.precip_prob[i] ?? null,
      });
    }
    const windowScore = sum / numSlots;
    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStartIdx = k;
    }
  }

  if (bestStartIdx < 0 || bestScore < 30) {
    return {
      best: null,
      fallbackMessage: "Conditions challenging today. Try early morning or check again later.",
    };
  }

  const i = bestStartIdx;
  const windMph = msToMph((hourly.wind_mps[i] ?? 0));
  const windType = windTypeRelativeToRoute(routeBearingDeg, hourly.wind_from_deg[i] ?? 0);
  const tempC = hourly.temp_c[i];
  const tempF = typeof tempC === "number" ? Math.round(cToF(tempC)) : null;
  const precipProb = hourly.precip_prob[i] ?? null;

  const startISO = times[i];
  const endSlot = Math.min(i + numSlots, times.length) - 1;
  const endISO = times[endSlot];

  const windLabel =
    windType === "tailwind"
      ? "Light tailwind"
      : windType === "headwind"
        ? "Headwind"
        : "Crosswind";
  const windStr = `${windLabel} • ${Math.round(windMph)} mph`;
  const tempStr = tempF != null ? ` • ${tempF}°F` : "";
  const precipStr =
    precipProb != null && precipProb >= 30 ? ` • ${precipProb}% rain chance` : " • Low rain chance";
  const summary = `${windStr}${tempStr}${precipStr}`.replace(/^ • /, "").trim();

  return {
    best: {
      startTime: formatHourLocal(startISO),
      endTime: formatHourLocal(endISO),
      startISO,
      endISO,
      windType,
      windMph: Math.round(windMph * 10) / 10,
      tempF,
      precipProb,
      summary,
    },
    fallbackMessage: null,
  };
}
