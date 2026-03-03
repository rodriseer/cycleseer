"use client";

import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="bg-zinc-950">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <Image
            src="/hero-cyclist.jpg"
            alt="Cyclist outdoors"
            fill
            className="object-cover"
            priority
          />
          {/* Slightly lighter overlay to keep image cinematic */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-zinc-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_20%,rgba(255,180,60,0.10),transparent_55%)]" />
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.15)_1px,transparent_0)] bg-[length:24px_24px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24 md:py-28 min-h-[calc(100vh-5rem)] flex items-center">
          <div className="max-w-xl w-full animate-[fadeIn_0.7s_var(--ease-mechanical)]">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight sm:tracking-[-0.04em] text-white leading-[1.05]">
              Precision for every ride.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-white/70">
              CycleSeer turns your route into a clear, honest score.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/results"
                className="inline-flex items-center justify-center rounded-full bg-[#f5b54a] px-6 py-3 text-sm font-medium text-zinc-950 transition-all duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#f7c060] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b54a]/60"
              >
                Score My Ride
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm text-white/70 hover:text-white/90 underline-offset-4 hover:underline"
              >
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What CycleSeer Does */}
      <section
        id="how-it-works"
        className="border-t border-white/10 bg-zinc-950/95"
      >
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-12 sm:py-16">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold tracking-[0.24em] text-white/50 uppercase">
              What CycleSeer does
            </h2>
            <p className="mt-3 text-lg font-medium text-white">
              A clean score built from real ride dynamics.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm text-white/75">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                Elevation
              </div>
              <p className="mt-2 text-white/75">
                We read the profile of every climb and descent, not just total gain.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                Efficiency
              </div>
              <p className="mt-2 text-white/75">
                We estimate how steady the effort will feel across the full route.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                Ride score
              </div>
              <p className="mt-2 text-white/75">
                We translate terrain, distance, and conditions into a single ride score.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="bg-zinc-950">
        <div className="mx-auto max-w-5xl px-5 sm:px-6 py-12 sm:py-16">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold tracking-[0.24em] text-white/50 uppercase">
              Why it matters
            </h2>
            <p className="mt-3 text-lg font-medium text-white">
              Choose the ride that matches your intent.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-white/75">
            <div>
              <p className="font-medium text-white">Train smarter</p>
              <p className="mt-1 text-white/70">
                See how demanding a route really is before you commit.
              </p>
            </div>
            <div>
              <p className="font-medium text-white">Avoid surprise brutality</p>
              <p className="mt-1 text-white/70">
                Catch hidden walls and stacked climbs before they catch you.
              </p>
            </div>
            <div>
              <p className="font-medium text-white">Match your goal</p>
              <p className="mt-1 text-white/70">
                Pick the route that fits recovery spins, tempo days, or big efforts.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
