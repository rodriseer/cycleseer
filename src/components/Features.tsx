import GlassCard from "@/components/ui/GlassCard";

const items = [
  { title: "Route scoring that makes sense", desc: "A clear score with breakdown so riders can trust the result." },
  { title: "Timing guidance", desc: "Find the best window to ride based on conditions." },
  { title: "Compare rides fast", desc: "A/B routes and pick what matches your goal: speed, comfort, safety." },
  { title: "Minimal, modern UI", desc: "Designed for cyclists: clean hierarchy, no clutter." },
  { title: "Built for mobile", desc: "Big type and clean cards that work outdoors." },
  { title: "Ready for premium features", desc: "Easy to extend with saved rides, subscriptions, and more factors." },
];

export default function Features() {
  return (
    <section id="features" className="bg-[#0B0F14] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl md:text-4xl tracking-tight">
            Built for cyclists who care about performance.
          </h2>
          <p className="mt-3 text-white/65">
            Score, breakdown, and best time to ride — in a UI that feels premium.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((x) => (
            <GlassCard key={x.title} className="p-6">
              <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/10" />
              <div className="mt-4 font-display text-xl">{x.title}</div>
              <p className="mt-2 text-sm text-white/65">{x.desc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}