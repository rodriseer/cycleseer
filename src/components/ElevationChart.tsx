"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElevPoint } from "@/lib/elevationScoring";

export default function ElevationChart({
  points,
  height = 170,
  onHoverDistanceM,
}: {
  points: ElevPoint[];
  height?: number;
  onHoverDistanceM?: (d_m: number | null) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState<number>(0);
  const [reveal, setReveal] = useState(false);

  const { w, h, path, minE, maxE, totalMi, maxD } = useMemo(() => {
    const w = 760;
    const h = height;

    if (!points?.length) {
      return { w, h, path: "", minE: 0, maxE: 0, totalMi: 0, maxD: 1 };
    }

    let minE = Infinity;
    let maxE = -Infinity;
    for (const p of points) {
      minE = Math.min(minE, p.e_m);
      maxE = Math.max(maxE, p.e_m);
    }
    if (minE === maxE) {
      minE -= 1;
      maxE += 1;
    }

    const maxD = points[points.length - 1]?.d_m ?? 1;
    const totalMi = maxD / 1609.344;

    const padT = 16;
    const padB = 24;
    const padL = 10;
    const padR = 10;

    const x = (d: number) => padL + (d / maxD) * (w - padL - padR);
    const y = (e: number) =>
      padT + ((maxE - e) / (maxE - minE)) * (h - padT - padB);

    let dStr = `M ${x(points[0].d_m).toFixed(2)} ${y(points[0].e_m).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      dStr += ` L ${x(points[i].d_m).toFixed(2)} ${y(points[i].e_m).toFixed(2)}`;
    }

    return { w, h, path: dStr, minE, maxE, totalMi, maxD };
  }, [points, height]);

  const hover = hoverIdx == null ? null : points[hoverIdx];

  function setHover(i: number | null) {
    setHoverIdx(i);
    const d = i == null ? null : points[i]?.d_m ?? null;
    onHoverDistanceM?.(d);
  }

  function onMove(e: React.MouseEvent) {
    if (!points?.length) return;
    const el = wrapRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    const idx = Math.round(pct * (points.length - 1));
    setHover(idx);
  }

  function onLeave() {
    setHover(null);
  }

  const label =
    hover == null
      ? null
      : {
          mi: (hover.d_m / 1609.344).toFixed(1),
          e: Math.round(hover.e_m),
        };

  const marker = useMemo(() => {
    if (!hover || !points?.length) return null;

    const padT = 16;
    const padB = 24;
    const padL = 10;
    const padR = 10;

    const x = padL + (hover.d_m / maxD) * (w - padL - padR);
    const y = padT + ((maxE - hover.e_m) / (maxE - minE)) * (h - padT - padB);
    return { x, y };
  }, [hover, maxD, w, h, minE, maxE, points]);

  // Measure path length and trigger left-to-right reveal (no bounce)
  useEffect(() => {
    if (!path || !pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    setPathLength(len);
    setReveal(false);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReveal(true));
    });
    return () => cancelAnimationFrame(t);
  }, [path]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">Elevation profile</div>
          <div className="mt-1 text-xs text-white/60">
            {points?.length ? `${totalMi.toFixed(1)} mi • ${points.length} samples` : "No data yet"}
          </div>
        </div>
        <div className="text-xs text-white/60">
          <span className="text-white/70 font-medium">{Math.round(minE)}</span> m →{" "}
          <span className="text-white/70 font-medium">{Math.round(maxE)}</span> m
        </div>
      </div>

      <div ref={wrapRef} className="relative px-3 py-4" onMouseMove={onMove} onMouseLeave={onLeave}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[170px]">
          {/* guide lines */}
          <path d={`M 0 ${h - 24} L ${w} ${h - 24}`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" fill="none" />
          <path d={`M 0 16 L ${w} 16`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />

          {/* area */}
          {path && <path d={`${path} L ${w} ${h - 24} L 0 ${h - 24} Z`} fill="rgba(251,191,36,0.12)" />}

          {/* line — stroke-dashoffset 100% → 0 on load */}
          {path && (
            <path
              ref={pathRef}
              d={path}
              fill="none"
              stroke="rgba(251,191,36,0.85)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={reveal ? 0 : pathLength}
              style={{
                transition: pathLength ? "stroke-dashoffset 900ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
              }}
            />
          )}

          {/* hover marker */}
          {marker && (
            <g>
              <line x1={marker.x} y1={16} x2={marker.x} y2={h - 24} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <circle cx={marker.x} cy={marker.y} r={5} fill="rgba(251,191,36,0.95)" />
              <circle cx={marker.x} cy={marker.y} r={10} fill="rgba(251,191,36,0.16)" />
            </g>
          )}
        </svg>

        {label && (
          <div className="absolute right-4 top-4 rounded-xl border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-white/80">
            <div className="text-white/60">Point</div>
            <div className="mt-1">
              <span className="font-medium text-white">{label.mi} mi</span> •{" "}
              <span className="font-medium text-white">{label.e} m</span>
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[11px] text-white/50 px-1">
          <span>0 mi</span>
          <span>{totalMi.toFixed(1)} mi</span>
        </div>
      </div>
    </div>
  );
}