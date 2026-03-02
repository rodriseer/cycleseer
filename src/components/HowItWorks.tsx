import GlassCard from "@/components/ui/GlassCard";

export default function HowItWorks() {
  return (
    <section id="how" className="bg-[#0F1720] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-3xl md:text-4xl tracking-tight">
          Three steps. One perfect ride.
        </h2>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <GlassCard className="p-6">
            <div className="text-xs text-white/60">Step 1</div>
            <div className="mt-2 font-display text-xl">Choose your start and end</div>
            <p className="mt-2 text-sm text-white/65">
              Search locations and build a route in seconds.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="text-xs text-white/60">Step 2</div>
            <div className="mt-2 font-display text-xl">Get the score and breakdown</div>
            <p className="mt-2 text-sm text-white/65">
              See what impacts the ride so you can make the right call.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="text-xs text-white/60">Step 3</div>
            <div className="mt-2 font-display text-xl">Pick the best time</div>
            <p className="mt-2 text-sm text-white/65">
              Find the best window, then ride with confidence.
            </p>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}