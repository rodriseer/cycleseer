import Link from "next/link";

export const metadata = {
  title: "About | CycleSeer",
  description: "CycleSeer helps cyclists find the best routes with smart scoring and ride mode intelligence.",
};

export default function AboutPage() {
  return (
    <div className="bg-zinc-950 min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          About CycleSeer
        </h1>
        <p className="mt-3 text-white/70">
          Route scoring for cyclists who ride outside.
        </p>

        <div className="mt-12 space-y-6 text-white/70 leading-relaxed">
          <p>
            CycleSeer combines route shape, elevation, and optional wind data into a clear 0–10 score. Enter a start and destination, pick a ride mode, and we show you how the route will feel—plus up to three alternatives so you can choose the best option.
          </p>
          <p>
            Built for fitness riders and commuters who want to plan smarter rides without the clutter. No long explanations on the homepage—just get in and score your ride.
          </p>
        </div>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link
            href="/results"
            className="inline-flex items-center justify-center rounded-full bg-amber-400 text-zinc-950 px-6 py-3 text-sm font-medium hover:bg-amber-300 transition"
          >
            Score My Ride
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            View features
          </Link>
        </div>
      </div>
    </div>
  );
}
