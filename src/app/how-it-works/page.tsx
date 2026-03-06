import Link from "next/link";

export const metadata = {
  title: "How it works | CycleSeer",
  description: "Learn how CycleSeer scores routes using elevation, wind, and ride mode intelligence.",
};

export default function HowItWorksPage() {
  return (
    <div className="bg-zinc-950 min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          How it works
        </h1>
        <p className="mt-3 text-white/70">
          Enter a start and destination, pick a ride mode, and get a clear score.
        </p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Enter your route</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Add a start point and destination. CycleSeer fetches route options and samples elevation along each path to understand the terrain.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">2. Choose a ride mode</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Select Scenic, Training, Commute, Flat & Fast, or Climbing Focus. The score adjusts to match your goal—efficiency, vertical gain, or comfort.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">3. Get your score</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              We combine elevation, wind (when available), and route efficiency into a 0–10 score. See steepest climb, longest climb, and timing insights at a glance.
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
            href="/ride-score"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            Learn about RideScore
          </Link>
        </div>
      </div>
    </div>
  );
}
