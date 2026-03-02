// src/app/api/score-loop/route.ts
import { NextResponse } from "next/server";
import { geocodePlace, directionsLoop } from "@/lib/mapbox";
import { fetchHourlyWXAt, pickHourIndex } from "@/lib/weather";
import { milesToMeters, metersToMiles, metersToKm, round1, clamp } from "@/lib/units";
import { evenlySpacedAnchors, resampleLineString } from "@/lib/geo";
import { makeWindBiasedConfigs, configToWaypoints, LoopCandidateConfig } from "@/lib/loopGen";
import { buildSegments, scoreWindAlongRoute, SegmentWind, scoreRideOverall } from "@/lib/scoring";
import { analyzeWindOnRoute } from "@/lib/routeAnalysis";
import { bestWindowsAtPoint } from "@/lib/bestWindow";

type ReqBody = {
  startText: string;
  distanceMiles: number;
  startTimeISO: string;
  tz?: string;
  rideType?: "road" | "gravel";
};

function isoHourInTZ(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  const hh = get("hour");
  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

type Candidate = {
  id: string;
  geometry: any;
  distance_m: number;
  duration_s: number;
  stage1Score: number;
};

function tweakConfigs(configs: LoopCandidateConfig[], factor: number): LoopCandidateConfig[] {
  // Expand or contract radii to hit distances better
  return configs.map((c) => ({
    ...c,
    r1: c.r1 * factor,
    r2: c.r2 * factor,
  }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;

    if (!body.startText || typeof body.startText !== "string") {
      return NextResponse.json({ ok: false, error: "startText is required" }, { status: 400 });
    }
    if (!body.startTimeISO) {
      return NextResponse.json({ ok: false, error: "startTimeISO is required" }, { status: 400 });
    }

    const tz = body.tz ?? "America/New_York";
    const rideType = body.rideType ?? "road";
    const distanceMiles = clamp(Number(body.distanceMiles ?? 20), 3, 80);
    const target_m = milesToMeters(distanceMiles);

    const dt = new Date(body.startTimeISO);
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid startTimeISO" }, { status: 400 });
    }
    const targetHour = isoHourInTZ(dt, tz);

    const start = await geocodePlace(body.startText);

    // Start weather for bias + stage 1
    const startWX = await fetchHourlyWXAt(start, tz);
    const startIdx = pickHourIndex(startWX.times, targetHour);
    const windFromDeg = startWX.wind_from_deg[startIdx];
    const windMps = startWX.wind_mps[startIdx];
    const gustMps = startWX.gust_mps[startIdx];
    const temp_c = startWX.temp_c[startIdx] ?? null;
    const precip_prob = startWX.precip_prob[startIdx] ?? null;

    // Base configs (wind-biased)
    const baseConfigs = makeWindBiasedConfigs(windFromDeg, target_m);

    // We will try multiple config sets to get enough valid loops
    const configSets: LoopCandidateConfig[][] = [
      baseConfigs,
      tweakConfigs(baseConfigs, 0.92),
      tweakConfigs(baseConfigs, 1.08),
      tweakConfigs(baseConfigs, 0.85),
      tweakConfigs(baseConfigs, 1.15),
    ];

    // Distance acceptance window
    const MIN_RATIO = 0.70;
    const MAX_RATIO = 1.45;

    const candidates: Candidate[] = [];
    let routeFailures = 0;
    let distanceRejects = 0;
    let attempted = 0;

    // Try config sets until we get enough valid routes
    for (const configs of configSets) {
      for (let i = 0; i < configs.length && candidates.length < 18; i++) {
        attempted++;
        const cfg = configs[i];
        const waypoints = configToWaypoints(start, cfg);

        try {
          const loop = await directionsLoop(waypoints);
          if (!loop) {
            routeFailures++;
            continue;
          }
          const ratio = loop.distance_m / target_m;
          if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
            distanceRejects++;
            continue;
          }

          // Stage 1 wind bias score: prefer tailwind start + moderate wind
          // (cheap heuristic, full scoring happens later)
          const tailStart = Math.max(0, -windMps); // placeholder (windMps isn't directional)
          const stage1Score =
            clamp(10 - windMps * 0.6, 0, 10) +
            clamp(10 - (gustMps - windMps) * 0.7, 0, 10) +
            tailStart;

          candidates.push({
            id: `c${candidates.length + 1}`,
            geometry: loop.geometry,
            distance_m: loop.distance_m,
            duration_s: loop.duration_s,
            stage1Score,
          });
        } catch {
          routeFailures++;
          continue;
        }
      }
      if (candidates.length >= 18) break;
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not generate any loops. Try a different start location or distance.",
          debug: { attempted, routeFailures, distanceRejects },
        },
        { status: 400 }
      );
    }

    // Stage 2: score along-route wind for top candidates
    candidates.sort((a, b) => b.stage1Score - a.stage1Score);
    const top = candidates.slice(0, Math.min(8, candidates.length));

    const scored = [];
    for (const c of top) {
      const points = resampleLineString(c.geometry, 1000);
      const segs = buildSegments(points);

      const anchors = evenlySpacedAnchors(points, 6);
      const zoneHourly = await Promise.all(anchors.map((a) => fetchHourlyWXAt(a, tz)));
      const zoneIdx = zoneHourly.map((z) => pickHourIndex(z.times, targetHour));

      const segWinds: SegmentWind[] = segs.map((s, i) => {
        const t = i / Math.max(1, segs.length - 1);
        const zone = Math.min(anchors.length - 1, Math.floor(t * anchors.length));
        const z = zoneHourly[zone];
        const idx = zoneIdx[zone];
        return {
          heading: s.heading,
          length_m: s.length_m,
          wind_mps: z.wind_mps[idx],
          gust_mps: z.gust_mps[idx],
          wind_from_deg: z.wind_from_deg[idx],
        };
      });

      const wind = scoreWindAlongRoute(segWinds);

      // Gravel is slightly more sensitive to gust exposure (optional heuristic)
      const typeAdj = rideType === "gravel" ? Math.max(0, wind.gustExposureIndex - 1.5) * 0.15 : 0;
      const finalWindScore = clamp(wind.windScore10 - typeAdj, 0, 10);

      const ride = scoreRideOverall({
        wind: { ...wind, windScore10: finalWindScore },
        temp_c,
        precip_prob,
        rideType,
      });

      const analysis = analyzeWindOnRoute(segWinds);

      scored.push({
        id: c.id,
        geometry: c.geometry,
        distance_m: c.distance_m,
        duration_s: c.duration_s,
        routeSummary: analysis.summary,
        ride,
        wind: {
          windScore10: round1(finalWindScore),
          headwindIndex: wind.headwindIndex,
          gustExposureIndex: wind.gustExposureIndex,
          tailwindFinishBonus: wind.tailwindFinishBonus,
        },
      });
    }

    scored.sort((a, b) => b.ride.score100 - a.ride.score100);

    const topLoops = scored.slice(0, 3).map((x) => ({
      id: x.id,
      distance: {
        mi: round1(metersToMiles(x.distance_m)),
        km: round1(metersToKm(x.distance_m)),
        target_mi: round1(distanceMiles),
      },
      duration_min: Math.round(x.duration_s / 60),
      geometry: x.geometry,
      routeSummary: x.routeSummary,
      ride: x.ride,
      wind: x.wind,
    }));

    const bestWindows = await bestWindowsAtPoint({
      p: start,
      tz,
      startHourISO: targetHour,
      windowHours: 2,
      horizonHours: 24,
      topK: 3,
    });

    return NextResponse.json({
      ok: true,
      mode: "loop",
      tz,
      start,
      targetHour,
      bestWindows,
      topLoops,
      debug: {
        attempted,
        routeFailures,
        distanceRejects,
        candidatesBuilt: candidates.length,
        stage2Scored: scored.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
