import Link from "next/link";

export const metadata = {
  title: "Features | CycleSeer",
  description: "Smart elevation analysis, ride mode intelligence, and route comparison for cyclists.",
};

export default function FeaturesPage() {
  return (
    <div className="bg-zinc-950 min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          Features
        </h1>
        <p className="mt-3 text-white/70">
          What you get when you score a ride with CycleSeer.
        </p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-white">Smart elevation analysis</h2>
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
            <h2 className="text-xl font-semibold text-white">Route comparison</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Get up to three route alternatives from start to destination. We score each one and highlight the best option for your selected ride mode. Click to preview each route on the map.
            </p>
          </section>
        </div>

        <div className="mt-14">
          <Link
            href="/results"
            className="inline-flex items-center justify-center rounded-full bg-amber-400 text-zinc-950 px-6 py-3 text-sm font-medium hover:bg-amber-300 transition"
          >
            Score My Ride
          </Link>
        </div>
      </div>
    </div>
  );
}
