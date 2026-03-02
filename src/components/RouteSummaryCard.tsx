import type { RouteSummary } from "@/lib/types";
import { metersToMiles, round1 } from "@/lib/units";

export default function RouteSummaryCard({ summary }: { summary: RouteSummary }) {
  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="text-sm font-medium opacity-80">Wind on route</div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs opacity-70">Distance</div>
          <div className="font-medium">{round1(metersToMiles(summary.distance_m))} mi</div>
        </div>
        <div>
          <div className="text-xs opacity-70">Avg wind</div>
          <div className="font-medium">{summary.avg_wind_mps} m/s</div>
        </div>
        <div>
          <div className="text-xs opacity-70">Headwind %</div>
          <div className="font-medium">{summary.headwind_pct}%</div>
        </div>
        <div>
          <div className="text-xs opacity-70">Crosswind %</div>
          <div className="font-medium">{summary.crosswind_pct}%</div>
        </div>
      </div>

      <div className="mt-3 text-xs opacity-70">
        Tailwind segments: {summary.tailwind_pct}%. Avg gust: {summary.avg_gust_mps} m/s.
      </div>
    </div>
  );
}
