"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type LngLat = { lat: number; lng: number };
type Line = { type: "LineString"; coordinates: [number, number][] };

type Props = {
  center: LngLat;
  line?: Line;
  pointA?: LngLat | null;
  pointB?: LngLat | null;
  onPick?: (p: LngLat) => void;
};

export default function MapView({ center, line, pointA, pointB, onPick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const aMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const bMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // init map once
  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: ref.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [center.lng, center.lat],
      zoom: 11,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");

    if (onPick) {
      map.on("click", (e: any) => {
        onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recenter if center changes a lot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 300 });
  }, [center.lat, center.lng]);

  // markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // A marker
    if (pointA) {
      if (!aMarkerRef.current) {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "999px";
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.25)";
        el.style.background = "#16a34a"; // green
        aMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([pointA.lng, pointA.lat]).addTo(map);
      } else {
        aMarkerRef.current.setLngLat([pointA.lng, pointA.lat]);
      }
    } else if (aMarkerRef.current) {
      aMarkerRef.current.remove();
      aMarkerRef.current = null;
    }

    // B marker
    if (pointB) {
      if (!bMarkerRef.current) {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "999px";
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.25)";
        el.style.background = "#dc2626"; // red
        bMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([pointB.lng, pointB.lat]).addTo(map);
      } else {
        bMarkerRef.current.setLngLat([pointB.lng, pointB.lat]);
      }
    } else if (bMarkerRef.current) {
      bMarkerRef.current.remove();
      bMarkerRef.current = null;
    }
  }, [pointA, pointB]);

  // route line (reliable: add/update without waiting for "load" each time)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const srcId = "route-src";
    const layerId = "route-layer";

    const ensure = () => {
      if (!line) return;

      const data = { type: "Feature", geometry: line, properties: {} } as any;

      if (map.getSource(srcId)) {
        (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData(data);
        return;
      }

      map.addSource(srcId, { type: "geojson", data });
      map.addLayer({
        id: layerId,
        type: "line",
        source: srcId,
        paint: {
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
    };

    const remove = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    };

    if (!line) {
      if (map.isStyleLoaded()) remove();
      else map.once("load", remove);
      return;
    }

    if (map.isStyleLoaded()) ensure();
    else map.once("load", ensure);

    // no cleanup here; we keep layer unless line disappears
  }, [line]);

  return <div ref={ref} className="h-[520px] w-full rounded-2xl overflow-hidden border" />;
}