import Image from "next/image";
import Link from "next/link";
import FeatureCard from "@/components/FeatureCard";

export default function HomePage() {
  return (
    <div className="bg-zinc-950">
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/hero-cyclist.jpg"
            alt="Cyclist outdoors"
            fill
            className="object-cover"
            priority
          />

          {/* Better outdoorsy overlay (readable + premium) */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-zinc-950" />

          {/* Sunrise tint */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,180,60,0.18),transparent_55%)]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 py-20 md:py-28 animate-[fadeIn_0.6s_ease-out]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-amber-400/90" />
              Built for real-world rides and commutes — currently in public beta
            </div>

            <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight text-white">
              Plan smarter rides.
              <span className="block text-white/70">
                Make weekend rides and weekday commutes feel faster and calmer.
              </span>
            </h1>

            <p className="mt-6 text-base md:text-lg leading-relaxed text-white/70">
              CycleSeer helps fitness riders and commuters choose better outdoor routes and the best
              time to ride by combining route shape, elevation feel, and live conditions into a
              clean, trusted score.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/results"
                className="inline-flex items-center justify-center rounded-full bg-amber-400 text-zinc-950 px-7 py-4 font-medium hover:bg-amber-300 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Open CycleSeer
              </Link>

              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-4 text-white hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                View features
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="Score clarity" value="0–10" />
              <Stat label="Best for" value="Fitness & commutes" />
              <Stat label="Checks" value="Wind, timing, effort" />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="mx-auto max-w-7xl px-5 py-16 md:py-20 animate-[fadeIn_0.6s_ease-out]"
      >
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Built for cyclists who ride outside
            </h2>
            <p className="mt-3 text-white/70 max-w-2xl">
              Clean scoring, breakdowns you trust, and timing guidance that matches real rides and
              everyday commutes.
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            badge="Score"
            title="Route scoring that makes sense"
            desc="A clear 0–10 score with a breakdown so weekend riders and commuters trust the result."
          />
          <FeatureCard
            badge="Timing"
            title="Best time to ride"
            desc="See windows with calmer winds and better comfort, so you avoid getting punished by headwinds."
          />
          <FeatureCard
            badge="Feel"
            title="Outdoorsy, readable UI"
            desc="A dark, trail-inspired interface that works outdoors — from sunrise rides to evening commutes."
          />
        </div>
      </section>

      {/* USE CASES */}
      <section className="mx-auto max-w-7xl px-5 pb-6 md:pb-10 animate-[fadeIn_0.6s_ease-out]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat
            label="Weekend ride"
            value="Pick a loop that feels quick without getting wrecked by wind."
          />
          <Stat
            label="Training block"
            value="Line up routes and conditions so key sessions actually feel doable."
          />
          <Stat
            label="Daily commute"
            value="Choose the calmer, safer-feeling option on days with tricky weather."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-t border-white/10 bg-zinc-950/40">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20 animate-[fadeIn_0.6s_ease-out]">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-3 text-white/70 max-w-2xl">
            Simple input. Clean output. A score and guidance you can act on.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step num="01" title="Enter start + destination" desc="Search your route like you normally would." />
            <Step num="02" title="We score the ride" desc="We compute route factors and condition-weighted difficulty." />
            <Step num="03" title="Pick the best window" desc="Ride when it feels fastest, safest, and most fun." />
          </div>

          <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Ready to test a route?</h3>
                <p className="mt-2 text-white/70">
                  Jump into the app and run a score. Keep it simple, keep it outdoors.
                </p>
              </div>
              <Link
                href="/results"
                className="inline-flex items-center justify-center rounded-full bg-white text-zinc-950 px-7 py-4 font-medium hover:bg-zinc-200 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Analyze a route
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/60">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function Step({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="text-xs text-white/60">{num}</div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}