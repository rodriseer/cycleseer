// src/app/api/score-route/route.ts
import { NextResponse } from "next/server";
import { scoreRoute, type RideMode } from "@/lib/routeScoring";
import { routeCache } from "@/lib/cache";

type PlaceBody = {
  text?: string;
  center?: [number, number] | null;
};

type Body = {
  startText?: string;
  endText?: string;
  startCenter?: [number, number] | null; // [lng, lat]
  endCenter?: [number, number] | null;
  places?: PlaceBody[];
  mode?: RideMode;
};

export async function POST(req: Request) {
  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing MAPBOX_TOKEN in .env.local" }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    const mode: RideMode = body.mode ?? "scenic";

    // New multi-stop flow: body.places
    if (Array.isArray(body.places) && body.places.length >= 2) {
      if (body.places.length > 5) {
        return NextResponse.json(
          { ok: false, error: "A maximum of 5 stops is supported." },
          { status: 400 }
        );
      }

      const trimmed = body.places.map((p) => ({
        text: (p.text ?? "").trim(),
        center:
          Array.isArray(p.center) && p.center.length === 2 ? p.center : null,
      }));

      let lastIdx = -1;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i].text) lastIdx = i;
      }

      if (lastIdx < 1) {
        return NextResponse.json(
          { ok: false, error: "At least a start and a destination are required." },
          { status: 400 }
        );
      }

      for (let i = 0; i <= lastIdx; i++) {
        if (!trimmed[i].text) {
          return NextResponse.json(
            {
              ok: false,
              error: "Fill all stops up to the destination or remove unused ones.",
            },
            { status: 400 }
          );
        }
      }

      const active = trimmed.slice(0, lastIdx + 1);

      const resolved = await Promise.all(
        active.map(async (p) => {
          if (p.center) {
            return { place_name: p.text, center: p.center as [number, number] };
          }
          return forwardGeocode(p.text, token);
        })
      );

      const centers = resolved.map((r) => r.center);

      // Fetch up to 3 alternative routes (if Mapbox provides them).
      const coords = centers.map(([lng, lat]) => `${lng},${lat}`).join(";");
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}` +
        `?geometries=geojson&overview=full&alternatives=true&access_token=${encodeURIComponent(
          token
        )}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`Directions failed (${r.status})`);
      const j = await r.json();

      const rawRoutes = (j?.routes ?? []) as any[];
      if (!rawRoutes.length) {
        throw new Error("No route returned");
      }

      const basicRoutes = rawRoutes.slice(0, 3).map((rt) => {
        if (!rt?.geometry?.coordinates?.length) {
          throw new Error("No route geometry returned");
        }
        const bbox = computeBbox(rt.geometry.coordinates);
        return {
          distance_m: rt.distance as number,
          duration_s: rt.duration as number,
          bbox,
          geometry: rt.geometry as {
            type: "LineString";
            coordinates: [number, number][];
          },
        };
      });

      const elevations = await Promise.all(
        basicRoutes.map((route) =>
          elevationFromTerrainRGB(route.geometry.coordinates, token)
        )
      );

      const labels = ["Route A", "Route B", "Route C"];

      const routes = basicRoutes.map((route, i) => {
        const elevation = elevations[i];
        const score = scoreRoute(
          route.distance_m,
          route.duration_s,
          elevation.gain_m,
          mode
        );
        return {
          id: String.fromCharCode(65 + i), // "A", "B", "C"
          label: labels[i] ?? `Route ${String.fromCharCode(65 + i)}`,
          route,
          elevation,
          score,
        };
      });

      const primary = routes[0];

      return NextResponse.json({
        ok: true,
        input: {
          places: active.map((p, i) => ({
            text: p.text,
            center: resolved[i].center,
          })),
        },
        // Keep top-level fields for backwards compatibility
        route: primary.route,
        elevation: primary.elevation,
        score: primary.score,
        routes,
      });
    }

    // Legacy A → B flow
    const startText = (body.startText ?? "").trim();
    const endText = (body.endText ?? "").trim();

    if (!startText || !endText) {
      return NextResponse.json(
        { ok: false, error: "startText and endText are required" },
        { status: 400 }
      );
    }

    const startCenter =
      Array.isArray(body.startCenter) && body.startCenter.length === 2
        ? body.startCenter
        : null;
    const endCenter =
      Array.isArray(body.endCenter) && body.endCenter.length === 2
        ? body.endCenter
        : null;

    const start = startCenter
      ? { place_name: startText, center: startCenter }
      : await forwardGeocode(startText, token);
    const end = endCenter
      ? { place_name: endText, center: endCenter }
      : await forwardGeocode(endText, token);

    const { route, elevation } = await getRouteWithElevation(
      start.center,
      end.center,
      token
    );

    const score = scoreRoute(
      route.distance_m,
      route.duration_s,
      elevation.gain_m,
      mode
    );

    return NextResponse.json({
      ok: true,
      input: { startText, endText },
      route,
      elevation,
      score,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

function routeKey(
  start: [number, number],
  end: [number, number]
) {
  const r = (n: number) => n.toFixed(5);
  return `${r(start[0])},${r(start[1])}|${r(end[0])},${r(end[1])}`;
}

async function getRouteWithElevation(
  start: [number, number],
  end: [number, number],
  token: string
) {
  const key = routeKey(start, end);
  const cached = routeCache.get(key);
  if (cached) {
    return cached as {
      route: Awaited<ReturnType<typeof cyclingDirections>>;
      elevation: Awaited<ReturnType<typeof elevationFromTerrainRGB>>;
    };
  }

  const route = await cyclingDirections(start, end, token);
  const elevation = await elevationFromTerrainRGB(
    route.geometry.coordinates,
    token
  );

  routeCache.set(key, { route, elevation });
  return { route, elevation };
}

async function forwardGeocode(query: string, token: string): Promise<{
  place_name: string;
  center: [number, number]; // [lng, lat]
}> {
  const url =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(query) +
    `.json?limit=1&access_token=${encodeURIComponent(token)}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
  const j = await r.json();

  const feat = j?.features?.[0];
  if (!feat?.center) throw new Error(`No geocoding result for: "${query}"`);
  return { place_name: feat.place_name, center: feat.center };
}

async function cyclingDirections(
  start: [number, number],
  end: [number, number],
  token: string
): Promise<{
  distance_m: number;
  duration_s: number;
  bbox: [number, number, number, number];
  geometry: { type: "LineString"; coordinates: [number, number][] };
}> {
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Directions failed (${r.status})`);
  const j = await r.json();

  const rt = j?.routes?.[0];
  if (!rt?.geometry?.coordinates?.length) throw new Error("No route returned");

  const bbox = computeBbox(rt.geometry.coordinates);

  return {
    distance_m: rt.distance,
    duration_s: rt.duration,
    bbox,
    geometry: rt.geometry,
  };
}

async function cyclingDirectionsMulti(
  points: [number, number][],
  token: string
): Promise<{
  distance_m: number;
  duration_s: number;
  bbox: [number, number, number, number];
  geometry: { type: "LineString"; coordinates: [number, number][] };
}> {
  if (points.length < 2) {
    throw new Error("At least two points are required for a route.");
  }

  const coords = points
    .map(([lng, lat]) => `${lng},${lat}`)
    .join(";");

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/cycling/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(
      token
    )}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Directions failed (${r.status})`);
  const j = await r.json();

  const rt = j?.routes?.[0];
  if (!rt?.geometry?.coordinates?.length) throw new Error("No route returned");

  const bbox = computeBbox(rt.geometry.coordinates);

  return {
    distance_m: rt.distance,
    duration_s: rt.duration,
    bbox,
    geometry: rt.geometry,
  };
}

/**
 * Terrain-RGB height (meters):
 * height = -10000 + (R*256*256 + G*256 + B) * 0.1
 */
async function elevationFromTerrainRGB(routeCoords: [number, number][], token: string) {
  const sampled = sampleLine(routeCoords, 120);

  const dist_m: number[] = [];
  let acc = 0;
  for (let i = 0; i < sampled.length; i++) {
    if (i === 0) dist_m.push(0);
    else {
      acc += haversineMeters(sampled[i - 1], sampled[i]);
      dist_m.push(acc);
    }
  }

  const elevations: number[] = [];
  const tileCache = new Map<string, Uint8ClampedArray>();

  for (const [lng, lat] of sampled) {
    const { z, x, y } = lngLatToTile(lng, lat, 14);
    const key = `${z}/${x}/${y}`;

    let pixels = tileCache.get(key);
    if (!pixels) {
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}@2x.pngraw?access_token=${encodeURIComponent(
        token
      )}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Terrain tile fetch failed (${res.status})`);

      const buf = new Uint8Array(await res.arrayBuffer());
      const rgba = await decodePngToRgba(buf);
      pixels = rgba;
      tileCache.set(key, pixels);
    }

    const elev = elevationAt(lng, lat, { z, x, y }, pixels);
    elevations.push(elev);
  }

  const stats = elevationStats(elevations);

  const points = elevations.map((e, i) => ({
    d_m: dist_m[i],
    e_m: e,
  }));

  return {
    samples: elevations.length,
    ...stats,
    profile: { points },
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function computeBbox(coords: [number, number][]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

function sampleLine(coords: [number, number][], targetSamples: number) {
  if (coords.length <= targetSamples) return coords;

  const step = Math.max(1, Math.floor(coords.length / targetSamples));
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

function elevationAt(
  lng: number,
  lat: number,
  tile: { z: number; x: number; y: number },
  rgba: Uint8ClampedArray
) {
  const { z, x, y } = tile;
  const n = 2 ** z;

  const fx = ((lng + 180) / 360) * n - x;
  const latRad = (lat * Math.PI) / 180;
  const fy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - y;

  const size = 512; // @2x
  const px = clamp(Math.floor(fx * size), 0, size - 1);
  const py = clamp(Math.floor(fy * size), 0, size - 1);

  const idx = (py * size + px) * 4;
  const R = rgba[idx];
  const G = rgba[idx + 1];
  const B = rgba[idx + 2];

  return -10000 + (R * 256 * 256 + G * 256 + B) * 0.1;
}

function elevationStats(elevations: number[]) {
  let min = Infinity,
    max = -Infinity;
  for (const e of elevations) {
    min = Math.min(min, e);
    max = Math.max(max, e);
  }

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 0) gain += d;
    else loss += -d;
  }

  return { min_m: min, max_m: max, gain_m: gain, loss_m: loss };
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);

  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

async function decodePngToRgba(buf: Uint8Array): Promise<Uint8ClampedArray> {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(Buffer.from(buf));
  return new Uint8ClampedArray(png.data);
}