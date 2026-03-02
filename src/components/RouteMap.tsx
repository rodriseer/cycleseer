"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";

type LngLat = [number, number];
type BBox = [number, number, number, number];

export default function RouteMap({
  coords,
  bbox,
  hoverDistanceM,
  elevationPoints,
}: {
  coords: LngLat[];
  bbox: BBox;
  hoverDistanceM?: number | null;
  elevationPoints?: { d_m: number; e_m: number }[];
}) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";
  // If you only have MAPBOX_TOKEN server-side, also add NEXT_PUBLIC_MAPBOX_TOKEN in .env.local for the map.

  const hoverCoord = useMemo(() => {
    if (hoverDistanceM == null || !elevationPoints?.length || !coords?.length) return null;

    // Find nearest elevation sample by distance, then map that index to route coordinate index
    const pts = elevationPoints;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].d_m - hoverDistanceM);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }

    const t = best / Math.max(1, pts.length - 1);
    const idx = Math.round(t * (coords.length - 1));
    return coords[Math.max(0, Math.min(coords.length - 1, idx))];
  }, [hoverDistanceM, elevationPoints, coords]);

  useEffect(() => {
    if (!elRef.current) return;

    if (!token) {
      // Map won’t render without a public token
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: elRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: coords?.[0] ?? [-77.0365, 38.8977],
      zoom: 11,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-width": 5,
          "line-opacity": 0.9,
          "line-color": "#fbbf24",
        },
      });

      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        paint: {
          "line-width": 10,
          "line-opacity": 0.18,
          "line-color": "#fbbf24",
        },
      });

      // Fit bounds
      const b = new mapboxgl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
      map.fitBounds(b, { padding: 40, duration: 600 });

      // Marker source
      map.addSource("hover-point", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "hover-point-circle",
        type: "circle",
        source: "hover-point",
        paint: {
          "circle-radius": 7,
          "circle-color": "#fbbf24",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0a0a0a",
        },
      });

      map.addLayer({
        id: "hover-point-halo",
        type: "circle",
        source: "hover-point",
        paint: {
          "circle-radius": 14,
          "circle-color": "#fbbf24",
          "circle-opacity": 0.18,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [coords, bbox, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource("hover-point")) return;

    const src = map.getSource("hover-point") as mapboxgl.GeoJSONSource;

    if (!hoverCoord) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: hoverCoord },
        },
      ],
    });
  }, [hoverCoord]);

  if (!token) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/30 p-4 text-sm text-white/70">
        Map needs a public Mapbox token. Add <span className="text-white font-medium">NEXT_PUBLIC_MAPBOX_TOKEN</span> to{" "}
        <span className="text-white font-medium">.env.local</span>.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Route map</div>
          <div className="mt-1 text-xs text-white/60">Hover the elevation profile to inspect the route</div>
        </div>
        <div className="text-xs text-white/60">Outdoors style</div>
      </div>
      <div ref={elRef} className="h-[360px] w-full" />
    </div>
  );
}