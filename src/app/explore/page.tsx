import Link from "next/link";

export const metadata = {
  title: "Explore | CycleSeer",
  description: "Compare route alternatives and find the best option for your ride.",
};

export default function ExplorePage() {
  return (
    <div className="bg-zinc-950 min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          Explore
        </h1>
        <p className="mt-3 text-white/70">
          Compare routes and find the best option for your ride.
        </p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-white">Route alternatives</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Get up to three route options from start to destination. Each route is scored so you can see which one fits your ride mode best.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Map preview</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              Click any route to preview it on the map. Compare elevation profiles and see how the terrain changes between options.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Best option highlighted</h2>
            <p className="mt-2 text-white/70 leading-relaxed">
              We highlight the top-scoring route for your selected mode. Switch modes to see how the recommendation changes—what&apos;s best for a commute might differ from a climbing focus ride.
            </p>
          </section>
        </div>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link
            href="/results"
            className="inline-flex items-center justify-center rounded-full bg-amber-400 text-zinc-950 px-6 py-3 text-sm font-medium hover:bg-amber-300 transition"
          >
            Explore routes
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
