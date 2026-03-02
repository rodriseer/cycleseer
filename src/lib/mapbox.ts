import { routeCache } from "./cache";
import { LatLng, LineString } from "./geo";

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

function assertToken() {
  if (!MAPBOX_TOKEN) throw new Error("Missing MAPBOX_TOKEN in environment.");
}

export async function geocodePlace(q: string): Promise<LatLng> {
  assertToken();
  const url =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(q) +
    `.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Geocoding failed");
  const j = await r.json();
  const f = j.features?.[0];
  if (!f) throw new Error("No geocode result");
  const [lng, lat] = f.center;
  return { lat, lng };
}

export type MapboxRoute = {
  geometry: LineString;
  distance_m: number;
  duration_s: number;
};

export async function directionsLoop(points: LatLng[]): Promise<MapboxRoute> {
  // expects [S, A, B, S]
  assertToken();
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");

  const cacheKey = `dir:${coords}`;
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&geometries=geojson&overview=full&steps=false`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Directions failed");
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("No route returned");

  const out: MapboxRoute = {
    geometry: { type: "LineString", coordinates: route.geometry.coordinates },
    distance_m: route.distance,
    duration_s: route.duration,
  };

  routeCache.set(cacheKey, out);
  return out;
}

export async function directionsABFastest(a: LatLng, b: LatLng): Promise<MapboxRoute> {
  assertToken();

  const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  const cacheKey = `dir:ab:fast:${coords}`;

  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&geometries=geojson&overview=full&steps=false`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("Directions failed");
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("No route returned");

  const out: MapboxRoute = {
    geometry: { type: "LineString", coordinates: route.geometry.coordinates },
    distance_m: route.distance,
    duration_s: route.duration,
  };

  routeCache.set(cacheKey, out);
  return out;
}