"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import RouteMap from "@/components/RouteMap";
import ElevationChart from "@/components/ElevationChart";
import { analyzeElevationSegments, ElevPoint } from "@/lib/elevationScoring";

type Suggestion = {
  id: string;
  place_name: string;
  center: [number, number] | null; // [lng, lat]
};

type ScoreResponse = {
  ok: true;
  input: any;
  route: {
    distance_m: number;
    duration_s: number;
    bbox: [number, number, number, number];
    geometry: { type: "LineString"; coordinates: [number, number][] };
  };
  elevation: {
    samples: number;
    min_m: number;
    max_m: number;
    gain_m: number;
    loss_m: number;
    profile: {
      points: ElevPoint[];
    };
  };
  score: {
    total: number; // 0-10
    factors: { efficiency: number; climbing: number; safety_proxy: number };
    summary: string;
  };
};

type ErrorResponse = { ok: false; error: string };

async function callApiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error("Request failed");
    }
    return json as T;
  }

  if (!res.ok) {
    const msg = json?.error ?? "Request failed";
    throw new Error(msg);
  }

  if (json && typeof json === "object" && "ok" in json && json.ok === false) {
    const msg = json.error ?? "Request failed";
    throw new Error(msg);
  }

  return json as T;
}

function metersToMiles(m: number) {
  return m / 1609.344;
}

function secondsToMin(s: number) {
  return Math.round(s / 60);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function gradeProxyPercent(distance_m: number, gain_m: number) {
  const km = Math.max(1, distance_m / 1000);
  const gainPerKm = gain_m / km;
  return clamp((gainPerKm / 10) * 1.0, 0, 8);
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function toDeg(r: number) {
  return (r * 180) / Math.PI;
}
function bearingDeg(a: [number, number], b: [number, number]) {
  // a,b are [lng,lat]
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}
function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// wind_dir_deg is direction wind is coming FROM (meteorology).
function windType(routeBearing: number, windFrom: number) {
  const windTo = (windFrom + 180) % 360;
  const diff = angleDiff(routeBearing, windTo);

  if (diff <= 35) return "Tailwind";
  if (diff >= 145) return "Headwind";
  return "Crosswind";
}

function windPenalty(score: number, wind_mph: number, type: string) {
  // Simple, readable penalty. Keep it small.
  if (!Number.isFinite(wind_mph) || wind_mph <= 4) return 0;

  const strength = clamp((wind_mph - 4) / 18, 0, 1); // ~0 to 1 across common winds
  if (type === "Headwind") return -clamp(0.2 + 1.2 * strength, 0, 1.2);
  if (type === "Crosswind") return -clamp(0.1 + 0.7 * strength, 0, 0.8);
  return +clamp(0.05 + 0.5 * strength, 0, 0.6); // tailwind can help slightly
}

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export default function ResultsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScoreResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [hoverDistM, setHoverDistM] = useState<number | null>(null);

  // Wind state
  const [wind, setWind] = useState<null | {
    wind_mph: number;
    wind_dir_deg: number;
    type: string;
    penalty: number;
  }>(null);

  const scoreColor = useMemo(() => {
    const v = (data?.score.total ?? 0) + (wind?.penalty ?? 0);
    if (v >= 8) return "text-emerald-200";
    if (v >= 6) return "text-amber-200";
    return "text-rose-200";
  }, [data, wind]);

  const [proximity, setProximity] = useState<string>("");

  useEffect(() => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setProximity(`${pos.coords.longitude},${pos.coords.latitude}`),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 3000 }
    );
  }, []);

  type StopState = {
    id: number;
    text: string;
    query: string;
    center: [number, number] | null;
    suggestions: Suggestion[];
    open: boolean;
    activeIndex: number;
  };

  const [stops, setStops] = useState<StopState[]>([
    { id: 1, text: "", query: "", center: null, suggestions: [], open: false, activeIndex: -1 },
    { id: 2, text: "", query: "", center: null, suggestions: [], open: false, activeIndex: -1 },
  ]);

  const suggestAbortRef = useRef<Record<number, AbortController | null>>({});
  const suggestDebounceRef = useRef<Record<number, number | null>>({});

  function updateStop(index: number, patch: Partial<StopState>) {
    setStops((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function closeAll() {
    setStops((prev) =>
      prev.map((s) => ({ ...s, open: false, activeIndex: -1 }))
    );
  }

  async function fetchSuggestFor(index: number, q: string) {
    const controller = new AbortController();
    const store = suggestAbortRef.current;
    store[index]?.abort();
    store[index] = controller;

    const url = new URL("/api/suggest", window.location.origin);
    url.searchParams.set("q", q);
    if (proximity) url.searchParams.set("proximity", proximity);

    const j = await callApiJson<{ ok: true; suggestions: Suggestion[] }>(
      url.toString(),
      { signal: controller.signal }
    );

    const list = (j.suggestions ?? []) as Suggestion[];
    updateStop(index, { suggestions: list });
  }

  function onChangeStop(index: number, v: string) {
    updateStop(index, {
      text: v,
      query: v,
      center: null,
      suggestions: [],
    });
    setErr(null);
    setData(null);
    setWind(null);
    setHoverDistM(null);

    const debounces = suggestDebounceRef.current;
    if (debounces[index]) window.clearTimeout(debounces[index]!);

    const q = v.trim();
    if (q.length < 2) {
      updateStop(index, { open: false, activeIndex: -1, suggestions: [] });
      return;
    }

    updateStop(index, { open: true, activeIndex: -1 });
    debounces[index] = window.setTimeout(() => {
      fetchSuggestFor(index, q).catch(() => {});
    }, 300);
  }

  function pickStop(index: number, s: Suggestion) {
    updateStop(index, {
      text: s.place_name,
      query: s.place_name,
      center: s.center ?? null,
      open: false,
      activeIndex: -1,
    });
  }

  function addStop() {
    setStops((prev) => {
      if (prev.length >= 5) return prev;
      const nextId = prev[prev.length - 1]?.id + 1 || 1;
      return [
        ...prev.slice(0, prev.length - 1),
        { id: nextId, text: "", query: "", center: null, suggestions: [], open: false, activeIndex: -1 },
        prev[prev.length - 1],
      ];
    });
  }

  function removeStop(index: number) {
    setStops((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  async function useMyLocation() {
    setErr(null);
    setData(null);
    setWind(null);
    setHoverDistM(null);

    if (!navigator?.geolocation) {
      setErr("Location isn’t supported here. You can still type a start place.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;

        setStops((prev) => {
          const next = [...prev];
          if (next[0]) {
            next[0] = { ...next[0], center: [lng, lat] as [number, number] };
          }
          return next;
        });

        try {
          const url = new URL("/api/reverse", window.location.origin);
          url.searchParams.set("lng", String(lng));
          url.searchParams.set("lat", String(lat));

          const r = await fetch(url.toString());
          const j = await r.json();
          if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Reverse geocode failed");

          const label = String(j.place_name ?? "Current location");
          setStops((prev) => {
            const next = [...prev];
            if (next[0]) {
              next[0] = { ...next[0], text: label, query: label };
            }
            return next;
          });
        } catch {
          setStops((prev) => {
            const next = [...prev];
            if (next[0]) {
              next[0] = { ...next[0], text: "Current location", query: "Current location" };
            }
            return next;
          });
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setErr("Location permission was denied. You can still type a start place.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErr("Location is currently unavailable. Try again in a moment or type a start place.");
        } else if (error.code === error.TIMEOUT) {
          setErr("Location lookup timed out. Try again, or type a start place.");
        } else {
          setErr("Could not access your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  async function onScore() {
    setErr(null);
    setData(null);
    setWind(null);
    setHoverDistM(null);

    const trimmed = stops.map((s) => ({ ...s, text: s.text.trim() }));
    let lastIdx = -1;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i].text) lastIdx = i;
    }
    if (lastIdx < 1) {
      setErr("At least a start and a destination are required.");
      return;
    }
    for (let i = 0; i <= lastIdx; i++) {
      if (!trimmed[i].text) {
        setErr("Fill all stops up to the destination or remove unused ones.");
        return;
      }
    }

    const activeStops = trimmed.slice(0, lastIdx + 1);

    setLoading(true);
    try {
      const j = await callApiJson<ScoreResponse>("/api/score-route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          places: activeStops.map((s) => ({
            text: s.text,
            center: s.center,
          })),
        }),
      });

      setData(j);
      closeAll();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // click outside closes dropdowns
  useEffect(() => {
    function onDocClick() {
      closeAll();
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Fetch wind after data loads
  useEffect(() => {
    async function run() {
      if (!data) return;

      const coords = data.route.geometry.coordinates;
      if (!coords?.length) return;

      const a = coords[0];
      const b = coords[coords.length - 1];
      const mid = coords[Math.floor(coords.length / 2)];

      const brng = bearingDeg(a, b);

      try {
        const url = new URL("/api/route-weather", window.location.origin);
        url.searchParams.set("lat", String(mid[1]));
        url.searchParams.set("lng", String(mid[0]));

        const j = await callApiJson<{ ok: true; wind_mph: number; wind_dir_deg: number }>(
          url.toString()
        );

        const type = windType(brng, j.wind_dir_deg);
        const pen = windPenalty(data.score.total, j.wind_mph, type);

        setWind({
          wind_mph: j.wind_mph,
          wind_dir_deg: j.wind_dir_deg,
          type,
          penalty: pen,
        });
      } catch {
        // ignore
      }
    }
    run();
  }, [data]);

  const distanceMiles = data ? metersToMiles(data.route.distance_m) : 0;
  const grade = data ? gradeProxyPercent(data.route.distance_m, data.elevation.gain_m) : 0;

  const segments = useMemo(() => {
    if (!data) return null;
    return analyzeElevationSegments(data.elevation.profile.points) ?? null;
  }, [data]);

  const displayedScore = useMemo(() => {
    const base = data?.score.total ?? 0;
    const adj = wind?.penalty ?? 0;
    return clamp(base + adj, 0, 10);
  }, [data, wind]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 animate-[fadeIn_0.6s_ease-out]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Route Analyzer</h1>
          <p className="mt-2 text-white/70 max-w-2xl">
            Autocomplete + scoring + elevation + map. This is the heart of CycleSeer.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          Back
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Route inputs</h2>
            <button
              type="button"
              onClick={useMyLocation}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              title="Use your current location as Start"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center">
                <PinIcon />
              </span>
              Use my location
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {stops.map((s, index) => {
              const isFirst = index === 0;
              const isLast = index === stops.length - 1;
              const label = isFirst
                ? "Start"
                : isLast
                  ? "Destination"
                  : `Stop ${index + 1}`;
              const placeholder = isFirst
                ? "e.g., Home or trailhead"
                : isLast
                  ? "e.g., Final destination"
                  : "e.g., Midpoint café or lookout";

              return (
                <div key={s.id} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <AutoField
                      label={label}
                      placeholder={placeholder}
                      value={s.text}
                      query={s.query}
                      open={s.open}
                      suggestions={s.suggestions}
                      activeIndex={s.activeIndex}
                      onActiveIndex={(fnOrIdx) =>
                        updateStop(
                          index,
                          typeof fnOrIdx === "function"
                            ? {
                                activeIndex: fnOrIdx(s.activeIndex),
                              }
                            : { activeIndex: fnOrIdx }
                        )
                      }
                      onChange={(v) => onChangeStop(index, v)}
                      onPick={(suggestion) => pickStop(index, suggestion)}
                      onFocus={() =>
                        s.text.trim().length >= 2 &&
                        updateStop(index, { open: true })
                      }
                      onKeyDown={(key) => {
                        if (!s.open) return;
                        if (key === "Escape") {
                          updateStop(index, { open: false });
                        }
                        if (key === "ArrowDown") {
                          updateStop(index, {
                            activeIndex: clamp(
                              s.activeIndex + 1,
                              0,
                              Math.max(0, s.suggestions.length - 1)
                            ),
                          });
                        }
                        if (key === "ArrowUp") {
                          updateStop(index, {
                            activeIndex: clamp(
                              s.activeIndex - 1,
                              0,
                              Math.max(0, s.suggestions.length - 1)
                            ),
                          });
                        }
                        if (key === "Enter") {
                          if (
                            s.activeIndex >= 0 &&
                            s.suggestions[s.activeIndex]
                          ) {
                            pickStop(index, s.suggestions[s.activeIndex]);
                          }
                        }
                      }}
                    />
                  </div>
                  {!isFirst && !isLast && (
                    <button
                      type="button"
                      onClick={() => removeStop(index)}
                      className="mt-7 text-xs text-white/50 hover:text-white/80 px-2"
                      title="Remove stop"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            {stops.length < 5 && (
              <button
                type="button"
                onClick={addStop}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="text-lg leading-none">+</span>
                Add stop (up to 5)
              </button>
            )}
          </div>

          <button
            onClick={onScore}
            disabled={loading}
            className="mt-6 w-full rounded-full bg-amber-400 text-zinc-950 px-6 py-3.5 font-medium hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01] active:scale-[0.98]"
          >
            {loading ? "Scoring..." : "Score route"}
          </button>

          {err && (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {err}
            </div>
          )}

          {loading && !data && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-3 w-16 bg-white/10 rounded" />
                <div className="mt-2 h-5 w-20 bg-white/10 rounded" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-3 w-10 bg-white/10 rounded" />
                <div className="mt-2 h-5 w-16 bg-white/10 rounded" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-3 w-12 bg-white/10 rounded" />
                <div className="mt-2 h-5 w-14 bg-white/10 rounded" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-3 w-16 bg-white/10 rounded" />
                <div className="mt-2 h-5 w-16 bg-white/10 rounded" />
              </div>
            </div>
          )}

          {data && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <MiniStat label="Distance" value={`${distanceMiles.toFixed(1)} mi`} />
              <MiniStat label="ETA" value={`${secondsToMin(data.route.duration_s)} min`} />
              <MiniStat label="Gain" value={`${Math.round(data.elevation.gain_m)} m`} />
              <MiniStat label="Grade proxy" value={`${grade.toFixed(1)}%`} />
            </div>
          )}

          {data && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <MiniStat label="Loss" value={`${Math.round(data.elevation.loss_m)} m`} />
              <MiniStat label="Min elev" value={`${Math.round(data.elevation.min_m)} m`} />
              <MiniStat label="Max elev" value={`${Math.round(data.elevation.max_m)} m`} />
              <MiniStat label="Samples" value={`${data.elevation.samples}`} />
            </div>
          )}

          {/* Segments (added) */}
          {data && segments && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/30 p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white">Route segments</div>
                <div className="text-xs text-white/60">Made to be easy to understand</div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Steepest climb</div>
                  {segments.steep ? (
                    <div className="mt-1 text-sm text-white/80">
                      <span className="font-medium text-white">
                        {(segments.steep.dist_m / 1609.344).toFixed(1)} mi
                      </span>{" "}
                      at <span className="font-medium text-white">{fmtPct(segments.steep.grade)}</span>{" "}
                      <span className="text-white/60">
                        (mile {(segments.steep.from_m / 1609.344).toFixed(1)}–{(segments.steep.to_m / 1609.344).toFixed(1)})
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-white/70">No meaningful steep section detected.</div>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Longest climb</div>
                  {segments.bestLen ? (
                    <div className="mt-1 text-sm text-white/80">
                      <span className="font-medium text-white">
                        {(segments.bestLen.dist_m / 1609.344).toFixed(1)} mi
                      </span>{" "}
                      at <span className="font-medium text-white">{fmtPct(segments.bestLen.avgGrade)}</span>{" "}
                      <span className="text-white/60">
                        (+{Math.round(segments.bestLen.gain_m)} m, mile {(segments.bestLen.from_m / 1609.344).toFixed(1)}–{(segments.bestLen.to_m / 1609.344).toFixed(1)})
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-white/70">No sustained climb detected.</div>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                  <div className="text-xs text-white/60">Rolling index</div>
                  <div className="mt-1 text-sm text-white/80">
                    This route feels <span className="font-medium text-white">{segments.roll}</span>{" "}
                    <span className="text-white/60">(how “up and down” it is)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Elevation + hover sync (added) */}
          {data && (
            <div className="mt-6">
              <ElevationChart
                points={data.elevation.profile.points}
                onHoverDistanceM={(d) => setHoverDistM(d)}
              />
              <div className="mt-2 text-xs text-white/55">
                Hover the elevation profile to inspect the route. This is the “why the score” visual.
              </div>
            </div>
          )}

          {/* Map (now hover synced) */}
          {loading && !data && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 h-[360px] animate-pulse" />
          )}
          {data && (
            <div className="mt-6">
              <RouteMap
                coords={data.route.geometry.coordinates}
                bbox={data.route.bbox}
                hoverDistanceM={hoverDistM}
                elevationPoints={data.elevation.profile.points}
              />
            </div>
          )}
        </div>

        {/* Score Card */}
        {loading && !data ? (
          <ScoreSkeleton />
        ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Ride score</h2>
            <span className="text-xs text-white/60">{data ? "Computed" : "Waiting"}</span>
          </div>

          {/* Wind badge (added) */}
          {data && wind && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3 text-sm text-white/80">
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/60">Wind</div>
                <div className="text-xs text-white/60">{wind.type}</div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <span className="font-medium text-white">{wind.wind_mph.toFixed(0)} mph</span>{" "}
                  <span className="text-white/60">at 10m</span>
                </div>
                <div className="text-white/70">
                  Impact:{" "}
                  <span className={wind.penalty < 0 ? "text-rose-200" : "text-emerald-200"}>
                    {wind.penalty < 0 ? `${wind.penalty.toFixed(1)}` : `+${wind.penalty.toFixed(1)}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Main score */}
          <div className="mt-6 relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="text-sm text-white/60">Overall ride feel</div>

              <div className={`mt-2 text-6xl font-semibold tracking-tight ${scoreColor}`}>
                {data ? displayedScore.toFixed(1) : "—"}{" "}
                <span className="text-base text-white/50">/10</span>
              </div>

              <div className="mt-2 text-xs text-white/55">
                {data && wind ? (
                  <>
                    Base: {data.score.total.toFixed(1)} • Wind:{" "}
                    {wind.penalty < 0 ? `${wind.penalty.toFixed(1)}` : `+${wind.penalty.toFixed(1)}`}
                  </>
                ) : (
                  "Includes distance, climbing, comfort… and wind when available."
                )}
              </div>

              <div className="mt-3 text-sm text-white/70">
                {data ? humanSummaryScore(displayedScore) : "Run a score to see an explanation and ride tips."}
              </div>

              {data && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill label="Ride type" value={rideLabel(data)} />
                  <Pill label="Best for" value={rideTypeTag(data)} />
                  <Pill label="Recommendation" value={rideRecommendation(data)} />
                </div>
              )}
            </div>
          </div>

          {/* Plain-English breakdown */}
          <div className="mt-6 space-y-3">
            <ExplainRow label="Speed feel" value={data ? to10(data.score.factors.efficiency) : null} hint={data ? speedHint(data) : "—"} />
            <ExplainRow label="Climb effort" value={data ? to10(data.score.factors.climbing) : null} hint={data ? climbHint(data) : "—"} />
            <ExplainRow label="Comfort" value={data ? to10(data.score.factors.safety_proxy) : null} hint={data ? comfortHint(data) : "—"} />
          </div>

          {/* Why section (kept) */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
            <div className="text-xs text-white/60">Why this score</div>

            {data ? (
              <ul className="mt-2 space-y-2 text-sm text-white/75">
                {whyBullets(data, wind).map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-amber-300/90 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-white/70">We’ll explain the result here after scoring.</div>
            )}
          </div>

          <div className="mt-4 text-xs text-white/50">
            Coming next: bike-friendliness (protected lanes, road type) to improve accuracy.
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Autocomplete input -------------------- */

function AutoField({
  label,
  placeholder,
  value,
  query,
  suggestions,
  open,
  activeIndex,
  onActiveIndex,
  onChange,
  onPick,
  onFocus,
  onKeyDown,
}: {
  label: string;
  placeholder: string;
  value: string;
  query: string;
  suggestions: Suggestion[];
  open: boolean;
  activeIndex: number;
  onActiveIndex: (i: number | ((x: number) => number)) => void;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
  onFocus: () => void;
  onKeyDown: (key: string) => void;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <label className="block">
        <div className="text-sm text-white/70">{label}</div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
              e.preventDefault();
              onKeyDown(e.key);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-amber-400/40"
        />
      </label>

      {open && (
        <div className="absolute mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-md shadow-[0_18px_40px_rgba(0,0,0,0.45)] z-50">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-white/60">Keep typing…</div>
          ) : (
            <ul className="max-h-64 overflow-auto">
              {suggestions.map((s, idx) => {
                const active = idx === activeIndex;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseEnter={() => onActiveIndex(idx)}
                      onClick={() => onPick(s)}
                      className={[
                        "w-full text-left px-4 py-3 text-sm transition flex items-start gap-3",
                        active ? "bg-white/8 text-white" : "text-white/80 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <span className="mt-[2px] text-white/60">
                        <PinIcon />
                      </span>
                      <span className="leading-snug">{highlightMatch(s.place_name, query)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-4 py-2 text-[11px] text-white/50 border-t border-white/10">
            Use ↑ ↓ then Enter • Esc to close
          </div>
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return text;

  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const i = lower.indexOf(qLower);
  if (i === -1) return text;

  const before = text.slice(0, i);
  const match = text.slice(i, i + q.length);
  const after = text.slice(i + q.length);

  return (
    <>
      {before}
      <span className="font-semibold text-white">{match}</span>
      {after}
    </>
  );
}

/* -------------------- Small UI components -------------------- */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/60">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-3 w-10 bg-white/10 rounded-full" />
      </div>
      <div className="mt-6 h-12 w-32 bg-white/10 rounded" />
      <div className="mt-4 h-3 w-full bg-white/10 rounded" />
      <div className="mt-3 h-3 w-5/6 bg-white/10 rounded" />
      <div className="mt-6 space-y-3">
        <div className="h-10 w-full bg-white/5 rounded-xl" />
        <div className="h-10 w-full bg-white/5 rounded-xl" />
        <div className="h-10 w-full bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
      <span className="text-white/60">{label}:</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function ExplainRow({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const pct = value == null ? 0 : (to10(value) / 10) * 100;

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/30 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white">{label}</div>
          <div className="mt-1 text-xs text-white/60">{hint}</div>
        </div>
        <div className="text-sm font-medium text-white">{value == null ? "—" : value.toFixed(1)}</div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-amber-300/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22s7-4.5 7-12a7 7 0 1 0-14 0c0 7.5 7 12 7 12Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 13.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/* -------------------- Score explanations (plain English) -------------------- */

function to10(v: number) {
  return Math.max(0, Math.min(10, v));
}

function humanSummaryScore(total: number) {
  if (total >= 8.5) return "Feels fast and smooth. Great outdoor ride.";
  if (total >= 7) return "Good ride. Some effort, but it should feel worth it.";
  if (total >= 5.5) return "Moderate ride. Expect some grind or slower sections.";
  return "Tough ride. Likely slow pace or heavy climbing.";
}

function rideTypeTag(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  const gainPerMile = d.elevation.gain_m / Math.max(1, miles);

  if (gainPerMile >= 90) return "Climbing day";
  if (miles >= 28) return "Endurance";
  if (d.score.total >= 8) return "Fast loop";
  return "Everyday ride";
}

function rideLabel(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  const gainPerMile = d.elevation.gain_m / Math.max(1, miles);

  const climbBand = gainPerMile >= 90 ? "Climbing" : gainPerMile >= 55 ? "Rolling" : "Flat";
  const lengthBand = miles >= 28 ? "endurance" : miles >= 14 ? "mid-distance" : "short";

  if (climbBand === "Climbing") return miles >= 14 ? "Climbing endurance ride" : "Climbing day";
  if (climbBand === "Rolling" && miles >= 22) return "Rolling endurance ride";
  if (climbBand === "Rolling") return "Rolling outdoor ride";
  if (climbBand === "Flat" && d.score.total >= 8) return "Fast flat loop";
  return `${climbBand} ${lengthBand} ride`;
}

function rideRecommendation(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  const gainPerMile = d.elevation.gain_m / Math.max(1, miles);

  if (gainPerMile >= 90) return "Pace it + bring fuel";
  if (miles >= 28) return "Bring water + snack";
  if (d.score.total >= 8) return "Great for tempo";
  if (d.score.total >= 6) return "Solid for endurance";
  return "Keep it easy";
}

function speedHint(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  const mins = secondsToMin(d.route.duration_s);
  const mph = miles / Math.max(0.1, mins / 60);

  if (mph >= 16) return `Projected pace: ~${mph.toFixed(1)} mph (fast feeling)`;
  if (mph >= 13) return `Projected pace: ~${mph.toFixed(1)} mph (steady)`;
  return `Projected pace: ~${mph.toFixed(1)} mph (relaxed)`;
}

function climbHint(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  const gainPerMile = d.elevation.gain_m / Math.max(1, miles);

  if (gainPerMile >= 90) return `Hilly: ~${Math.round(gainPerMile)} m gain per mile`;
  if (gainPerMile >= 55) return `Rolling: ~${Math.round(gainPerMile)} m gain per mile`;
  return `Mostly flat: ~${Math.round(gainPerMile)} m gain per mile`;
}

function comfortHint(d: ScoreResponse) {
  const miles = metersToMiles(d.route.distance_m);
  if (miles <= 8) return "Short + approachable (good for quick rides)";
  if (miles <= 18) return "Comfortable length for most riders";
  return "Longer ride (plan fuel + pacing)";
}

function whyBullets(d: ScoreResponse, wind: null | { wind_mph: number; type: string; penalty: number }) {
  const miles = metersToMiles(d.route.distance_m);
  const mins = secondsToMin(d.route.duration_s);
  const mph = miles / Math.max(0.1, mins / 60);

  const gain = Math.round(d.elevation.gain_m);
  const loss = Math.round(d.elevation.loss_m);
  const minE = Math.round(d.elevation.min_m);
  const maxE = Math.round(d.elevation.max_m);

  const gainPerMile = d.elevation.gain_m / Math.max(1, miles);
  const climbLabel = gainPerMile >= 90 ? "hilly" : gainPerMile >= 55 ? "rolling" : "mostly flat";

  const label = rideLabel(d);
  const rec = rideRecommendation(d);

  const base = [
    `Ride type: ${label}. Recommendation: ${rec}.`,
    `Distance is ${miles.toFixed(1)} miles with an estimated time of ${mins} minutes (~${mph.toFixed(1)} mph).`,
    `Elevation gain is ${gain} m and loss is ${loss} m, so it’s a ${climbLabel} ride.`,
    `Elevation range: ${minE} m → ${maxE} m (bigger range usually feels more “up and down”).`,
  ];

  if (wind) {
    base.unshift(
      `Wind: ${wind.type} at ~${wind.wind_mph.toFixed(0)} mph (score impact ${wind.penalty < 0 ? wind.penalty.toFixed(1) : `+${wind.penalty.toFixed(1)}`}).`
    );
  }

  return base;
}