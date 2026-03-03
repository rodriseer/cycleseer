"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import RouteMap from "@/components/RouteMap";
import ElevationChart from "@/components/ElevationChart";
import { analyzeElevationSegments, ElevPoint } from "@/lib/elevationScoring";
import { scoreRoute, type RideMode, RIDE_MODES } from "@/lib/routeScoring";

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
  // Primary score for the first route (kept for backwards compatibility)
  score: {
    total: number; // 0-10
    factors: { efficiency: number; climbing: number; safety_proxy: number };
    summary: string;
    mode?: RideMode;
    modeLabel?: string;
    modeDescription?: string;
  };
  // Optional comparison set when the API returns multiple alternatives
  routes?: RouteOption[];
};

type RouteOption = {
  id: string; // "A", "B", "C"
  label: string; // "Route A", ...
  route: ScoreResponse["route"];
  elevation: ScoreResponse["elevation"];
  score: ScoreResponse["score"];
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

/** Animate from current to target over duration (ease-out). Used for score counter. */
function useAnimatedScore(target: number, durationMs = 600) {
  const [display, setDisplay] = useState(0);
  const ref = useRef({ target, raf: 0, startVal: 0, startTime: 0 });

  useEffect(() => {
    ref.current.target = target;
    ref.current.startVal = display;
    ref.current.startTime = performance.now();

    const tick = (now: number) => {
      const { startVal, startTime } = ref.current;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quad
      const v = startVal + (target - startVal) * eased;
      setDisplay(v);
      if (t < 1) ref.current.raf = requestAnimationFrame(tick);
    };
    ref.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current.raf);
  }, [target, durationMs]);

  return display;
}

function ResultsPageContent() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScoreResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [hoverDistM, setHoverDistM] = useState<number | null>(null);

  const [rideMode, setRideMode] = useState<RideMode>(() => {
    const initial = (searchParams.get("mode") as RideMode | null) ?? "scenic";
    const allowed = new Set<RideMode>(["scenic", "training", "commute", "flat_fast", "climbing_focus"]);
    return allowed.has(initial) ? initial : "scenic";
  });
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);

  // Wind state
  const [wind, setWind] = useState<null | {
    wind_mph: number;
    wind_dir_deg: number;
    type: string;
    penalty: number;
  }>(null);

  // Mobile accordions: which route row is expanded; whether "Why this score" is open
  const [expandedRouteIdx, setExpandedRouteIdx] = useState<number | null>(null);
  const [whyScoreOpen, setWhyScoreOpen] = useState(false);

  // Best time to ride (from hourly forecast + route bearing)
  const [bestTime, setBestTime] = useState<null | {
    best: {
      startTime: string;
      endTime: string;
      startISO: string;
      endISO: string;
      windType: string;
      windMph: number;
      tempF: number | null;
      summary: string;
    } | null;
    fallbackMessage: string | null;
  }>(null);

  const routeOptions = useMemo<RouteOption[]>(() => {
    if (!data) return [];
    if (Array.isArray(data.routes) && data.routes.length > 0) {
      return data.routes;
    }
    // Fallback: single route response shaped as one option
    return [
      {
        id: "A",
        label: "Route A",
        route: data.route,
        elevation: data.elevation,
        score: data.score,
      },
    ];
  }, [data]);

  useEffect(() => {
    // Reset active route when a new response arrives
    setActiveRouteIdx(0);
  }, [data]);

  const safeIdx = routeOptions.length
    ? Math.max(0, Math.min(activeRouteIdx, routeOptions.length - 1))
    : 0;

  const activeOption = routeOptions.length ? routeOptions[safeIdx] : null;

  const perRouteModeScores = useMemo(
    () =>
      routeOptions.map((opt) =>
        scoreRoute(
          opt.route.distance_m,
          opt.route.duration_s,
          opt.elevation.gain_m,
          rideMode
        )
      ),
    [routeOptions, rideMode]
  );

  const modeScore = perRouteModeScores[safeIdx] ?? null;

  const bestRouteIdx = useMemo(() => {
    if (!perRouteModeScores.length) return -1;
    let best = 0;
    for (let i = 1; i < perRouteModeScores.length; i++) {
      if (perRouteModeScores[i].total > perRouteModeScores[best].total) {
        best = i;
      }
    }
    return best;
  }, [perRouteModeScores]);

  const activeData: ScoreResponse | null = useMemo(() => {
    if (!data) return null;
    if (!activeOption) return data;
    const activeScore = modeScore ?? activeOption.score;
    return {
      ...data,
      route: activeOption.route,
      elevation: activeOption.elevation,
      score: {
        ...activeOption.score,
        total: activeScore.total,
        factors: activeScore.factors ?? activeOption.score.factors,
        summary: activeScore.summary ?? activeOption.score.summary,
      },
    };
  }, [data, activeOption, modeScore]);

  const selectedModeMeta = useMemo(() => {
    return RIDE_MODES.find((m) => m.id === rideMode) ?? RIDE_MODES[0];
  }, [rideMode]);

  const scoreColor = useMemo(() => {
    const base = modeScore?.total ?? 0;
    const v = base + (wind?.penalty ?? 0);
    if (v >= 8) return "text-emerald-200";
    if (v >= 6) return "text-amber-200";
    return "text-rose-200";
  }, [modeScore, wind]);

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

  const [stops, setStops] = useState<StopState[]>(() => {
    const start = (searchParams.get("start") ?? "").trim();
    const end = (searchParams.get("end") ?? "").trim();
    return [
      {
        id: 1,
        text: start,
        query: start,
        center: null,
        suggestions: [],
        open: false,
        activeIndex: -1,
      },
      {
        id: 2,
        text: end,
        query: end,
        center: null,
        suggestions: [],
        open: false,
        activeIndex: -1,
      },
    ];
  });

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
          mode: rideMode,
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

  // Fetch wind after data loads or active route changes
  useEffect(() => {
    async function run() {
      if (!activeData) return;

      const coords = activeData.route.geometry.coordinates;
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
        const pen = windPenalty(activeData.score.total, j.wind_mph, type);
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
  }, [activeData]);

  // Fetch best time to ride (hourly forecast + route bearing)
  useEffect(() => {
    if (!activeData) {
      setBestTime(null);
      return;
    }
    const data = activeData;
    async function run() {
      const coords = data.route.geometry.coordinates;
      if (!coords?.length) return;
      const a = coords[0];
      const b = coords[coords.length - 1];
      const mid = coords[Math.floor(coords.length / 2)];
      const brng = bearingDeg(a, b);
      try {
        const url = new URL("/api/best-time", window.location.origin);
        url.searchParams.set("lat", String(mid[1]));
        url.searchParams.set("lng", String(mid[0]));
        url.searchParams.set("bearing", String(Math.round(brng)));
        const j = await callApiJson<{
          ok: true;
          best: { startTime: string; endTime: string; startISO: string; endISO: string; windType: string; windMph: number; tempF: number | null; summary: string } | null;
          fallbackMessage: string | null;
        }>(url.toString());
        setBestTime({
          best: j.best ?? null,
          fallbackMessage: j.fallbackMessage ?? null,
        });
      } catch {
        setBestTime(null);
      }
    }
    run();
  }, [activeData]);

  const distanceMiles = activeData ? metersToMiles(activeData.route.distance_m) : 0;
  const grade = activeData
    ? gradeProxyPercent(activeData.route.distance_m, activeData.elevation.gain_m)
    : 0;

  const segments = useMemo(() => {
    if (!activeData) return null;
    return analyzeElevationSegments(activeData.elevation.profile.points) ?? null;
  }, [activeData]);

  const displayedScore = useMemo(() => {
    const base = modeScore?.total ?? 0;
    const adj = wind?.penalty ?? 0;
    return clamp(base + adj, 0, 10);
  }, [modeScore, wind]);

  const animatedScore = useAnimatedScore(displayedScore, 600);

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
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10 transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 active:translate-y-0"
        >
          Back
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs + map column — second on mobile (below score), first on desktop */}
        <div className="order-2 lg:order-1 lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Route inputs</h2>
            <button
              type="button"
              onClick={useMyLocation}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 active:translate-y-0"
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
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="text-lg leading-none">+</span>
                Add stop (up to 5)
              </button>
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white/80">Ride mode</div>
                <div className="mt-1 text-xs text-white/55">
                  {selectedModeMeta.description}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {RIDE_MODES.map((m) => {
                  const active = m.id === rideMode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRideMode(m.id)}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
                        active
                          ? "bg-amber-400 text-zinc-950 shadow-sm"
                          : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={onScore}
            disabled={loading}
            className="mt-6 w-full rounded-full bg-amber-400 text-zinc-950 px-6 py-3.5 font-medium hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          >
            {loading ? "Scoring..." : "Score route"}
          </button>

          {err && (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {err}
            </div>
          )}

          {loading && !data && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4 animate-pulse">
                <div className="h-3 w-12 bg-white/10 rounded" />
                <div className="mt-1.5 h-4 w-14 bg-white/10 rounded" />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4 animate-pulse">
                <div className="h-3 w-8 bg-white/10 rounded" />
                <div className="mt-1.5 h-4 w-12 bg-white/10 rounded" />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4 animate-pulse">
                <div className="h-3 w-10 bg-white/10 rounded" />
                <div className="mt-1.5 h-4 w-12 bg-white/10 rounded" />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4 animate-pulse">
                <div className="h-3 w-14 bg-white/10 rounded" />
                <div className="mt-1.5 h-4 w-12 bg-white/10 rounded" />
              </div>
            </div>
          )}

          {activeData && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <MiniStat label="Distance" value={`${distanceMiles.toFixed(1)} mi`} />
              <MiniStat label="ETA" value={`${secondsToMin(activeData.route.duration_s)} min`} />
              <MiniStat label="Gain" value={`${Math.round(activeData.elevation.gain_m)} m`} />
              <MiniStat label="Grade proxy" value={`${grade.toFixed(1)}%`} />
            </div>
          )}

          {activeData && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <MiniStat label="Loss" value={`${Math.round(activeData.elevation.loss_m)} m`} />
              <MiniStat label="Min elev" value={`${Math.round(activeData.elevation.min_m)} m`} />
              <MiniStat label="Max elev" value={`${Math.round(activeData.elevation.max_m)} m`} />
              <MiniStat label="Samples" value={`${activeData.elevation.samples}`} />
            </div>
          )}

          {/* Map — after key stats on mobile for correct flow: score → stats → map → breakdown */}
          {loading && !activeData && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 h-[360px] animate-pulse" />
          )}
          {activeData && (
            <div className="mt-6">
              <RouteMap
                coords={activeData.route.geometry.coordinates}
                bbox={activeData.route.bbox}
                hoverDistanceM={hoverDistM}
                elevationPoints={activeData.elevation.profile.points}
                elevationGainM={activeData.elevation.gain_m}
              />
            </div>
          )}

          {/* Elevation chart — part of breakdown below map */}
          {activeData && (
            <div className="mt-6">
              <ElevationChart
                points={activeData.elevation.profile.points}
                onHoverDistanceM={(d) => setHoverDistM(d)}
              />
              <div className="mt-2 text-xs text-white/55">
                Hover the elevation profile to inspect the route. This is the "why the score" visual.
              </div>
            </div>
          )}

          {/* Route segments — last in the score result flow */}
          {activeData && segments && (
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
        </div>

        {/* Score Card column — only render result sections after a valid scored route (data !== null) */}
        <div className="order-1 lg:order-2 flex flex-col gap-6">
          {loading && !data && <ScoreSkeleton />}

          {!loading && !data && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <p className="text-sm text-white/60">
                Enter a start and destination, then click <strong className="text-white/80">Score route</strong> to see your ride score and best time.
              </p>
            </div>
          )}

          {data && activeData && (
            <div key={activeRouteIdx} className="animate-fadeInShort">
              {/* Best Time to Ride — only after we have a result */}
              {bestTime && (bestTime.best || bestTime.fallbackMessage) && (
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-950/40 to-zinc-950/60 p-5 shadow-sm">
                  {bestTime.best ? (
                    <>
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-200/90">
                        Best Time to Ride Today
                      </div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {bestTime.best.startTime} – {bestTime.best.endTime}
                      </div>
                      <div className="mt-2 text-sm text-white/80">
                        {bestTime.best.summary}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-medium uppercase tracking-wide text-amber-200/90">
                        Conditions Challenging Today
                      </div>
                      <div className="mt-2 text-sm text-white/80">
                        {bestTime.fallbackMessage ?? "Strong headwinds or rain likely. Try early morning or check again later."}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Ride Score card — only when API has returned a valid result */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base md:text-lg font-semibold tracking-tight">Ride score</h2>
                  <span className="text-xs text-white/60">Computed</span>
                </div>

                {/* Results Summary strip — mobile only: score + key stats + wind in one compact block */}
                <div className="mt-3 md:hidden grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-zinc-950/30 p-3">
                  <div className="col-span-2 flex items-baseline justify-between gap-2">
                    <span className={`text-3xl font-semibold tracking-tight ${scoreColor} ${displayedScore >= 8 ? "shadow-[0_0_20px_rgba(34,197,94,0.22)]" : ""}`}>
                      {animatedScore.toFixed(1)}
                    </span>
                    <span className="text-sm text-white/50">/10</span>
                  </div>
                  <div className="text-[11px] text-white/50">Distance</div>
                  <div className="text-right text-sm font-medium text-white">{distanceMiles.toFixed(1)} mi</div>
                  <div className="text-[11px] text-white/50">Gain</div>
                  <div className="text-right text-sm font-medium text-white">{Math.round(activeData.elevation.gain_m)} m</div>
                  <div className="text-[11px] text-white/50">ETA</div>
                  <div className="text-right text-sm font-medium text-white">{secondsToMin(activeData.route.duration_s)} min</div>
                  {wind && (
                    <>
                      <div className="text-[11px] text-white/50">Wind</div>
                      <div className="text-right text-xs text-white/80">
                        {wind.type} {wind.wind_mph.toFixed(0)} mph
                        <span className={wind.penalty < 0 ? " text-rose-200" : " text-emerald-200"}>
                          {" "}({wind.penalty < 0 ? "" : "+"}{wind.penalty.toFixed(1)})
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Route comparison — mobile: compact list + accordion; desktop: grid of cards */}
                {routeOptions.length > 1 && (
                  <>
                    <div className="mt-3 md:hidden">
                      <div className="text-[11px] text-white/50 mb-1">Route comparison</div>
                      <div className="space-y-1">
                        {routeOptions.map((opt, idx) => {
                          const isBest = idx === bestRouteIdx;
                          const ms = perRouteModeScores[idx];
                          const scoreVal = (ms?.total ?? opt.score.total).toFixed(1);
                          const miles = metersToMiles(opt.route.distance_m).toFixed(1);
                          const elevFt = Math.round(opt.elevation.gain_m * 3.28084);
                          const mins = secondsToMin(opt.route.duration_s);
                          const isExpanded = expandedRouteIdx === idx;
                          return (
                            <div key={opt.id} className="rounded-lg border border-white/10 bg-zinc-950/40 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveRouteIdx(idx);
                                  setHoverDistM(null);
                                  setExpandedRouteIdx((p) => (p === idx ? null : idx));
                                }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                              >
                                <span className="font-medium text-white">{opt.label}</span>
                                {isBest && <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">Best</span>}
                                <span className="text-white/90">{scoreVal}</span>
                                <span className="text-white/60">{miles} mi</span>
                                <span className="text-white/60">{elevFt} ft</span>
                                <span className="text-white/60">{mins} min</span>
                                <span className="text-white/50">{isExpanded ? "▲" : "▼"}</span>
                              </button>
                              {isExpanded && (
                                <div className="px-3 pb-3 pt-0 text-[11px] text-white/70 border-t border-white/10">
                                  <div className="grid grid-cols-2 gap-1 mt-2">
                                    <span>Distance</span><span>{miles} mi</span>
                                    <span>Gain</span><span>{elevFt} ft</span>
                                    <span>Time</span><span>{mins} min</span>
                                    <span>Score</span><span>{scoreVal} /10</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-4 hidden md:block rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-white/60">Route comparison</div>
                        {bestRouteIdx >= 0 && (
                          <div className="text-[11px] text-emerald-200">Best for {selectedModeMeta.label}</div>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {routeOptions.map((opt, idx) => {
                          const isActive = idx === safeIdx;
                          const isBest = idx === bestRouteIdx;
                          const ms = perRouteModeScores[idx];
                          const scoreVal = ms?.total ?? opt.score.total;
                          const miles = metersToMiles(opt.route.distance_m);
                          const mins = secondsToMin(opt.route.duration_s);
                          const elevFt = Math.round(opt.elevation.gain_m * 3.28084);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => { setActiveRouteIdx(idx); setHoverDistM(null); }}
                              className={[
                                "rounded-xl border px-3 py-3 text-left text-xs transition-all duration-150",
                                isActive ? "border-amber-300 bg-amber-300/10 shadow-sm" : "border-white/10 bg-zinc-950/40 hover:border-amber-200/60 hover:bg-zinc-950/60",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-white text-sm">{opt.label}</div>
                                {isBest && <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">Best</span>}
                              </div>
                              <div className="mt-1 text-lg font-semibold text-white">{scoreVal.toFixed(1)}<span className="text-[10px] text-white/60"> /10</span></div>
                              <div className="mt-2 space-y-1 text-[11px] text-white/70">
                                <div>Dist: {miles.toFixed(1)} mi</div>
                                <div>Gain: {elevFt} ft</div>
                                <div>Time: {mins} min</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Wind — desktop only (on mobile wind is in Results Summary) */}
                {wind && (
                  <div className="mt-4 hidden md:block rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3 text-sm text-white/80">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/60">Wind</div>
                      <div className="text-xs text-white/60">{wind.type}</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <div><span className="font-medium text-white">{wind.wind_mph.toFixed(0)} mph</span> <span className="text-white/60">at 10m</span></div>
                      <div className="text-white/70">
                        Impact: <span className={wind.penalty < 0 ? "text-rose-200" : "text-emerald-200"}>
                          {wind.penalty < 0 ? `${wind.penalty.toFixed(1)}` : `+${wind.penalty.toFixed(1)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Overall ride feel — mobile: text-only insight (no repeated score); desktop: full */}
                <div className="mt-4 md:mt-6 relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-4 md:p-6 overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.25),transparent_60%)]" />
                  <div className="relative">
                    {/* Mobile: one score lives in Results Summary only; here: mode badge + verdict + Why accordion */}
                    <div className="md:hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        {modeScore && (
                          <span className="rounded-full border border-white/15 bg-zinc-950/40 px-2 py-0.5 text-[10px] text-white/70">{modeScore.modeLabel}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-white/80">{humanSummaryScore(displayedScore)}</p>
                      <button
                        type="button"
                        onClick={() => setWhyScoreOpen((o) => !o)}
                        className="mt-2 flex items-center gap-1 text-xs text-white/60 hover:text-white/80"
                      >
                        Why this score {whyScoreOpen ? "▲" : "▼"}
                      </button>
                      {whyScoreOpen && (
                        <ul className="mt-2 space-y-1.5 text-xs text-white/75 pl-1">
                          {whyBullets(activeData, wind).map((b, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-300/90 shrink-0" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* Desktop: full card */}
                    <div className="hidden md:block">
                      <div className="text-sm text-white/60">Overall ride feel</div>
                      {modeScore && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-zinc-950/40 px-3 py-1 text-[11px] text-white/70">
                          <span className="uppercase tracking-wide text-[10px] text-white/50">Ride mode</span>
                          <span className="font-medium text-white">{modeScore.modeLabel}</span>
                        </div>
                      )}
                      <div className={`mt-3 text-6xl font-semibold tracking-tight ${scoreColor} ${displayedScore >= 8 ? "shadow-[0_0_28px_rgba(34,197,94,0.2)]" : ""}`}>
                        {animatedScore.toFixed(1)} <span className="text-base text-white/50">/10</span>
                      </div>
                      <div className="mt-2 text-xs text-white/55">
                        {wind && modeScore ? (
                          <>Base: {modeScore.total.toFixed(1)} • Wind: {wind.penalty < 0 ? `${wind.penalty.toFixed(1)}` : `+${wind.penalty.toFixed(1)}`}</>
                        ) : (
                          "Includes distance, climbing, comfort… and wind when available."
                        )}
                      </div>
                      {modeScore && <div className="mt-2 text-xs text-white/60">{modeScore.modeDescription}</div>}
                      <div className="mt-3 text-sm text-white/70">{humanSummaryScore(displayedScore)}</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Pill label="Ride type" value={rideLabel(activeData)} />
                        <Pill label="Best for" value={rideTypeTag(activeData)} />
                        <Pill label="Recommendation" value={rideRecommendation(activeData)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Speed feel / Climb effort / Comfort + Why — desktop only */}
                <div className="mt-6 hidden md:block space-y-3">
                  <ExplainRow label="Speed feel" value={to10(activeData.score.factors.efficiency)} hint={speedHint(activeData)} />
                  <ExplainRow label="Climb effort" value={to10(activeData.score.factors.climbing)} hint={climbHint(activeData)} />
                  <ExplainRow label="Comfort" value={to10(activeData.score.factors.safety_proxy)} hint={comfortHint(activeData)} />
                </div>
                <div className="mt-6 hidden md:block rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
                  <div className="text-xs text-white/60">Why this score</div>
                  <ul className="mt-2 space-y-2 text-sm text-white/75">
                    {whyBullets(activeData, wind).map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-amber-300/90 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 text-xs text-white/50">
                  Coming next: bike-friendliness (protected lanes, road type) to improve accuracy.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsPageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsPageFallback />}>
      <ResultsPageContent />
    </Suspense>
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
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-0.5 text-base font-semibold tracking-tight text-white md:text-lg">{value}</div>
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
