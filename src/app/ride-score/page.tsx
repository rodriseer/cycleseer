import Link from "next/link";

export const metadata = {
  title: "RideScore | CycleSeer",
  description: "How CycleSeer scores routes using elevation, wind, and ride mode intelligence.",
};

export default function RideScorePage() {
  return (
    <div className="bg-zinc-950 min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          RideScore
        </h1>
        <p className="mt-3 text-white/70">
          A 0–10 score that tells you how a route will feel before you ride.
        </p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-white">Elevation analysis</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              We sample elevation along your route and surface steepest climb, longest climb, and a rolling index so you know how the ride will feel before you go.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Ride mode intelligence</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Choose Scenic, Training, Commute, Flat & Fast, or Climbing Focus. The score adjusts to match your goal—efficiency, vertical gain, or comfort.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Wind & weather</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              When wind data is available, we factor in headwind exposure, gust risk, and tailwind bonuses. The score reflects real conditions, not just the map.
            </p>
          </section>
        </div>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link
            href="/results"
            className="inline-flex items-center justify-center rounded-full bg-amber-400 text-zinc-950 px-6 py-3 text-sm font-medium hover:bg-amber-300 transition"
          >
            Score My Ride
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            Explore routes
          </Link>
        </div>
      </div>
    </div>
  );
}
