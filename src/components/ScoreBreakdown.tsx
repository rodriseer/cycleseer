import type { PenaltyBreakdown } from "@/lib/types";

function Bar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>{label}</span>
        <span>{v}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-black/10">
        <div className="h-2 rounded-full bg-black/30" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default function ScoreBreakdown({ penalties }: { penalties: PenaltyBreakdown }) {
  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="text-sm font-medium opacity-80">What&apos;s making it harder</div>
      <div className="mt-3 grid gap-3">
        <Bar label="Wind" value={penalties.wind} />
        <Bar label="Gusts" value={penalties.gusts} />
        <Bar label="Weather" value={penalties.weather} />
        <Bar label="Elevation" value={penalties.elevation} />
      </div>
      <div className="mt-3 text-xs opacity-70">
        Higher numbers mean more difficulty. Elevation is a placeholder until we add elevation sampling.
      </div>
    </div>
  );
}
