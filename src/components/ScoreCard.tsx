import type { RideScore } from "@/lib/types";

function pillClasses(label: RideScore["label"]) {
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

export default function ScoreCard({ title, ride }: { title: string; ride: RideScore }) {
  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium opacity-80">{title}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-4xl font-semibold">{ride.score100}</div>
            <div className="text-sm opacity-70">/ 100</div>
          </div>
        </div>

        <div className={`rounded-full border px-3 py-1 text-sm font-medium ${pillClasses(ride.label)}`}>
          {ride.label}
        </div>
      </div>

      <div className="mt-3 text-sm opacity-80">
        Wind score: <span className="font-medium">{ride.windScore10}</span> / 10
      </div>
    </div>
  );
}
