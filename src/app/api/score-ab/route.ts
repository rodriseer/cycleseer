import { NextResponse } from "next/server";
import { directionsABFastest } from "@/lib/mapbox";

type LatLng = { lat: number; lng: number };
type Body = {
  a: LatLng;
  b: LatLng;
  startTimeISO: string; // ISO string (server time)
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

// --- geo helpers ---
function toRad(x: number) {
  return (x * Math.PI) / 180;
}

function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function bearingDeg(a: LatLng, b: LatLng) {
  // 0..360, 0 = North
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function angleDiffDeg(a: number, b: number) {
  // minimal absolute difference 0..180
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- sampling ---
function sampleRoutePoints(coords: [number, number][], everyMeters = 2000): LatLng[] {
  // coords are [lng, lat]
  if (coords.length < 2) return [];

  const out: LatLng[] = [];
  let acc = 0;

  let prev: LatLng = { lng: coords[0][0], lat: coords[0][1] };
  out.push(prev);

  for (let i = 1; i < coords.length; i++) {
    const cur: LatLng = { lng: coords[i][0], lat: coords[i][1] };
    const d = haversineM(prev, cur);
    acc += d;

    if (acc >= everyMeters) {
      out.push(cur);
      acc = 0;
    }
    prev = cur;
  }

  // ensure last point
  const last = coords[coords.length - 1];
  const lastP = { lng: last[0], lat: last[1] };
  const end = out[out.length - 1];
  if (!end || end.lat !== lastP.lat || end.lng !== lastP.lng) out.push(lastP);

  return out;
}

// --- weather: Open-Meteo (hourly) ---
type Wx = {
  windSpeed: number;   // m/s
  windGust: number;    // m/s
  windDir: number;     // degrees
  tempC: number;
  precipProb: number;  // %
};

async function fetchWxAt(lat: number, lng: number, timeISO: string): Promise<Wx> {
  // open-meteo returns hourly arrays. We'll pick the closest hour.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation_probability` +
    `&timezone=UTC`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Weather fetch failed");
  const j = await r.json();

  const tArr: string[] = j.hourly?.time ?? [];
  const ws: number[] = j.hourly?.wind_speed_10m ?? [];
  const wg: number[] = j.hourly?.wind_gusts_10m ?? [];
  const wd: number[] = j.hourly?.wind_direction_10m ?? [];
  const tc: number[] = j.hourly?.temperature_2m ?? [];
  const pp: number[] = j.hourly?.precipitation_probability ?? [];

  if (!tArr.length) throw new Error("No weather data");

  const target = new Date(timeISO).getTime();
  let bestIdx = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < tArr.length; i++) {
    const tt = new Date(tArr[i] + "Z").getTime(); // ensure UTC parse
    const d = Math.abs(tt - target);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }

  // wind_speed_10m from open-meteo is typically in km/h unless specified;
  // They often return in km/h. Convert to m/s if it's km/h:
  // We can’t 100% infer units without params, but open-meteo default is km/h.
  // Convert km/h -> m/s:
  const kphToMs = (x: number) => x / 3.6;

  return {
    windSpeed: kphToMs(ws[bestIdx] ?? 0),
    windGust: kphToMs(wg[bestIdx] ?? 0),
    windDir: wd[bestIdx] ?? 0,
    tempC: tc[bestIdx] ?? 0,
    precipProb: pp[bestIdx] ?? 0,
  };
}

// --- scoring ---
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function labelFromScore(score: number) {
  if (score >= 85) return "Great";
  if (score >= 70) return "Good";
  if (score >= 50) return "Meh";
  return "Skip";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON");
  }

  if (!body?.a || !body?.b) return bad("Missing a/b points");
  if (typeof body.startTimeISO !== "string" || !body.startTimeISO) {
    return bad("Missing startTimeISO");
  }

  const t = new Date(body.startTimeISO);
  if (Number.isNaN(t.getTime())) return bad("Invalid startTimeISO");

  // 1) route from Mapbox (fastest)
  const route = await directionsABFastest(body.a, body.b);
  const coords = route.geometry.coordinates;

  // 2) sample points
  const samples = sampleRoutePoints(coords, 2000); // every ~2km
  const mid = samples[Math.floor(samples.length / 2)] ?? body.a;

  // 3) fetch weather at a few points (keep it light for MVP)
  // Use: start, middle, end (3 calls)
  const startP = samples[0] ?? body.a;
  const endP = samples[samples.length - 1] ?? body.b;

  const [wxStart, wxMid, wxEnd] = await Promise.all([
    fetchWxAt(startP.lat, startP.lng, body.startTimeISO),
    fetchWxAt(mid.lat, mid.lng, body.startTimeISO),
    fetchWxAt(endP.lat, endP.lng, body.startTimeISO),
  ]);

  // Average conditions
  const avg = {
    windSpeed: (wxStart.windSpeed + wxMid.windSpeed + wxEnd.windSpeed) / 3,
    windGust: (wxStart.windGust + wxMid.windGust + wxEnd.windGust) / 3,
    windDir: (wxStart.windDir + wxMid.windDir + wxEnd.windDir) / 3,
    tempC: (wxStart.tempC + wxMid.tempC + wxEnd.tempC) / 3,
    precipProb: (wxStart.precipProb + wxMid.precipProb + wxEnd.precipProb) / 3,
  };

  // 4) headwind/crosswind analysis (use overall bearing A->B)
  const routeBearing = bearingDeg(body.a, body.b);
  // windDir is direction wind is coming FROM.
  // The direction you ride TOWARD is routeBearing.
  // Headwind is strongest when wind comes from your forward direction.
  const diff = angleDiffDeg(routeBearing, avg.windDir);

  // diff ~ 0 => wind from front (headwind)
  // diff ~ 180 => tailwind
  const headwindFactor = clamp(1 - diff / 180, 0, 1); // 1 headwind, 0 tailwind-ish
  const crosswindFactor = clamp(1 - Math.abs(diff - 90) / 90, 0, 1); // near 90 = crosswind

  // Convert to “penalties”
  const windPenalty = clamp(avg.windSpeed * 6 * headwindFactor, 0, 60); // m/s * factor
  const gustPenalty = clamp(Math.max(0, avg.windGust - avg.windSpeed) * 5, 0, 25);
  const rainPenalty = clamp(avg.precipProb * 0.25, 0, 25);
  const tempPenalty = clamp(Math.max(0, Math.abs(avg.tempC - 18) - 8) * 2.0, 0, 20);

  const crosswindPenalty = clamp(avg.windSpeed * 4 * crosswindFactor, 0, 25);

  const effortPenalty = windPenalty + gustPenalty + tempPenalty;
  const safetyPenalty = crosswindPenalty + rainPenalty;

  const totalPenalty = clamp(effortPenalty * 0.7 + safetyPenalty * 0.6, 0, 100);
  const score = clamp(100 - totalPenalty, 0, 100);

  const notes: string[] = [];
  if (headwindFactor > 0.6 && avg.windSpeed > 4) notes.push("Headwind-heavy route. Expect higher effort.");
  if (crosswindFactor > 0.6 && avg.windSpeed > 5) notes.push("Strong crosswind sections. Be careful on exposed roads.");
  if (avg.precipProb >= 40) notes.push("Rain risk is moderate to high.");
  if (avg.windGust - avg.windSpeed >= 4) notes.push("Gusty conditions. Wind may feel inconsistent.");

  return NextResponse.json({
    ok: true,
    score,
    label: labelFromScore(score),
    breakdown: {
      wind: Math.round(windPenalty),
      gusts: Math.round(gustPenalty),
      rain: Math.round(rainPenalty),
      temp: Math.round(tempPenalty),
      crosswind: Math.round(crosswindPenalty),
    },
    routeSummary: {
      distance_m: route.distance_m,
      duration_s: route.duration_s,
      bearing_deg: routeBearing,
      headwindFactor: Number(headwindFactor.toFixed(2)),
      crosswindFactor: Number(crosswindFactor.toFixed(2)),
    },
    conditionsAvg: {
      windSpeed_ms: Number(avg.windSpeed.toFixed(2)),
      windGust_ms: Number(avg.windGust.toFixed(2)),
      windDir_deg: Math.round(avg.windDir),
      tempC: Number(avg.tempC.toFixed(1)),
      precipProb_pct: Math.round(avg.precipProb),
    },
    line: route.geometry,
    notes,
  });
}