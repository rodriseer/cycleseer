import type { TimeWindow } from "@/lib/types";

function labelPill(label: TimeWindow["label"]) {
  switch (label) {
    case "Great":
      return "bg-emerald-600/10 text-emerald-800 border-emerald-200";
    case "Good":
      return "bg-lime-600/10 text-lime-800 border-lime-200";
    case "Meh":
      return "bg-amber-600/10 text-amber-800 border-amber-200";
    case "Skip":
      return "bg-rose-600/10 text-rose-800 border-rose-200";
    default:
      return "bg-slate-600/10 text-slate-800 border-slate-200";
  }
}

function prettyHour(iso: string) {
  // iso is like "YYYY-MM-DDTHH:00"
  const hh = iso.slice(11, 13);
  const mm = iso.slice(14, 16);
  const date = iso.slice(0, 10);
  return `${date} ${hh}:${mm}`;
}

export default function WindowPicker({ windows }: { windows: TimeWindow[] }) {
  if (!windows?.length) return null;
  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="text-sm font-medium opacity-80">Best 2-hour windows</div>
      <div className="mt-3 grid gap-2">
        {windows.map((w) => (
          <div key={w.startISO} className="flex items-center justify-between gap-3 rounded-xl border bg-white/60 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{prettyHour(w.startISO)} → {prettyHour(w.endISO)}</div>
              <div className="text-xs opacity-70">Score {w.score100}/100</div>
            </div>
            <div className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${labelPill(w.label)}`}>
              {w.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
