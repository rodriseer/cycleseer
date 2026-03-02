import { clamp } from "./units";

export type LatLng = { lat: number; lng: number };
export type LineString = { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]

const R = 6371000; // meters

export function toRad(d: number) { return (d * Math.PI) / 180; }
export function toDeg(r: number) { return (r * 180) / Math.PI; }

export function haversineMeters(a: LatLng, b: LatLng) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const s =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingDeg(a: LatLng, b: LatLng) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const λ1 = toRad(a.lng), λ2 = toRad(b.lng);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

export function destination(a: LatLng, bearing: number, distMeters: number): LatLng {
  const δ = distMeters / R;
  const θ = toRad(bearing);
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lng);

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(clamp(sinφ2, -1, 1));
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2);
  const λ2 = λ1 + Math.atan2(y, x);

  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

export function angleDiffDeg(a: number, b: number) {
  // smallest difference between angles (0..180)
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function lineStringLengthMeters(ls: LineString) {
  let total = 0;
  for (let i = 0; i < ls.coordinates.length - 1; i++) {
    const p1 = { lng: ls.coordinates[i][0], lat: ls.coordinates[i][1] };
    const p2 = { lng: ls.coordinates[i + 1][0], lat: ls.coordinates[i + 1][1] };
    total += haversineMeters(p1, p2);
  }
  return total;
}

export function resampleLineString(ls: LineString, stepMeters: number): LatLng[] {
  const pts: LatLng[] = [];
  if (ls.coordinates.length < 2) return pts;

  let acc = 0;
  let prev = { lng: ls.coordinates[0][0], lat: ls.coordinates[0][1] };
  pts.push({ ...prev });

  for (let i = 1; i < ls.coordinates.length; i++) {
    const cur = { lng: ls.coordinates[i][0], lat: ls.coordinates[i][1] };
    const seg = haversineMeters(prev, cur);
    if (seg <= 0) continue;

    let d = stepMeters - acc;
    while (d <= seg) {
      const t = d / seg;
      const interp = {
        lat: prev.lat + (cur.lat - prev.lat) * t,
        lng: prev.lng + (cur.lng - prev.lng) * t,
      };
      pts.push(interp);
      d += stepMeters;
    }
    acc = (acc + seg) % stepMeters;
    prev = cur;
  }

  const last = ls.coordinates[ls.coordinates.length - 1];
  pts.push({ lng: last[0], lat: last[1] });
  return pts;
}

export function evenlySpacedAnchors(points: LatLng[], k: number): LatLng[] {
  if (points.length === 0) return [];
  if (k <= 1) return [points[0]];
  const anchors: LatLng[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (points.length - 1)) / (k - 1));
    anchors.push(points[idx]);
  }
  return anchors;
}