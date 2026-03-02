import { NextResponse } from "next/server";
import { geocodePlace, directionsABFastest } from "@/lib/mapbox";

type LatLng = { lat: number; lng: number };

type Body = {
  originText: string;
  destText: string;
  startTimeISO: string;
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

// --- geo helpers ---
function toRad(x: number) {
  return (x * Math.PI) / 180;
}
function bearingDeg(a: LatLng, b: LatLng) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}
function angleDiffDeg(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

// --- weather: Open-Meteo ---
type Wx = {
  windSpeed: number; // m/s
  windGust: number; // m/s
  windDir: number; // degrees FROM
  tempC: number;
  precipProb: number; // %
};

async function fetchWxAt(lat: number, lng: number, timeISO: string): Promise<Wx> {
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
    const tt = new Date(tArr[i] + "Z").getTime();
    const d = Math.abs(tt - target);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }

  const kphToMs = (x: number) => x / 3.6;

  return {
    windSpeed: kphToMs(ws[bestIdx] ?? 0),
    windGust: kphToMs(wg[bestIdx] ?? 0),
    windDir: wd[bestIdx] ?? 0,
    tempC: tc[bestIdx] ?? 0,
    precipProb: pp[bestIdx] ?? 0,
  };
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

  const originText = (body?.originText ?? "").trim();
  const destText = (body?.destText ?? "").trim();
  const startTimeISO = (body?.startTimeISO ?? "").trim();

  if (!originText) return bad("Missing originText");
  if (!destText) return bad("Missing destText");
  if (!startTimeISO) return bad("Missing startTimeISO");

  const t = new Date(startTimeISO);
  if (Number.isNaN(t.getTime())) return bad("Invalid startTimeISO");

  // 1) Geocode
  const [a, b] = await Promise.all([geocodePlace(originText), geocodePlace(destText)]);

  // 2) Fastest route
  const route = await directionsABFastest(a, b);

  // 3) Weather at start/mid/end (light MVP)
  const coords = route.geometry.coordinates;
  const midCoord = coords[Math.floor(coords.length / 2)] ?? coords[0];
  const mid = { lng: midCoord[0], lat: midCoord[1] };

  const [wxA, wxM, wxB] = await Promise.all([
    fetchWxAt(a.lat, a.lng, startTimeISO),
    fetchWxAt(mid.lat, mid.lng, startTimeISO),
    fetchWxAt(b.lat, b.lng, startTimeISO),
  ]);

  const avg = {
    windSpeed: (wxA.windSpeed + wxM.windSpeed + wxB.windSpeed) / 3,
    windGust: (wxA.windGust + wxM.windGust + wxB.windGust) / 3,
    windDir: (wxA.windDir + wxM.windDir + wxB.windDir) / 3,
    tempC: (wxA.tempC + wxM.tempC + wxB.tempC) / 3,
    precipProb: (wxA.precipProb + wxM.precipProb + wxB.precipProb) / 3,
  };

  // Route bearing A->B
  const routeBearing = bearingDeg(a, b);
  const diff = angleDiffDeg(routeBearing, avg.windDir);

  const headwindFactor = clamp(1 - diff / 180, 0, 1);
  const crosswindFactor = clamp(1 - Math.abs(diff - 90) / 90, 0, 1);

  const windPenalty = clamp(avg.windSpeed * 6 * headwindFactor, 0, 60);
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
    originText,
    destText,
    a,
    b,
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