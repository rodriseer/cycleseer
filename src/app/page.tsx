"use client";

import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="bg-zinc-950">
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/55 to-zinc-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_20%,rgba(255,180,60,0.12),transparent_50%)]" />
          {/* Subtle texture */}
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.15)_1px,transparent_0)] bg-[length:24px_24px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 md:py-24 min-h-[calc(100vh-5rem)] flex items-center">
          <div className="max-w-2xl w-full">
            {/* Typography */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.08]">
              Find the best cycling route in seconds.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-white/65 max-w-lg">
              Enter your route and we&apos;ll score how it will feel outside.
            </p>

            {/* CTA card */}
            <div className="mt-14 sm:mt-16 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-md p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset]">
              <Link
                href="/results"
                className="flex w-full sm:w-auto sm:inline-flex items-center justify-center rounded-xl bg-amber-400 text-zinc-950 px-8 py-4 sm:py-4 text-base font-semibold hover:bg-amber-300 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-[0_4px_14px_rgba(251,191,36,0.25)]"
              >
                Score My Ride
              </Link>
            </div>

            {/* Feature pills — more space above */}
            <div className="mt-14 sm:mt-16 flex flex-wrap gap-3 sm:gap-4 text-xs text-white/60">
              <FeaturePill label="Smart elevation analysis" />
              <FeaturePill label="Ride mode intelligence" />
              <FeaturePill label="Route comparison" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeaturePill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
      <span>{label}</span>
    </div>
  );
}
