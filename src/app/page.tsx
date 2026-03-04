"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const HERO_IMAGES = [
  "/cycleseer/hero-1.jpg",
  "/cycleseer/hero-2.jpg",
  "/cycleseer/hero-3.jpg",
] as const;

function pickHeroImage() {
  return HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
}

export default function HomePage() {
  const [heroImage] = useState(() => pickHeroImage());
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="bg-zinc-950">
      {/* Hero */}
      <section className="relative overflow-hidden pt-28 md:pt-32 pb-16 sm:pb-20">
        {/* Background */}
        <div className="absolute inset-0">
          <Image
            src={heroImage}
            alt="Cyclist on a ride"
            fill
            className={`object-cover object-center transition-opacity duration-700 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            priority
            onLoadingComplete={() => setImageLoaded(true)}
          />
          {/* Dark, slightly blurred overlay to keep text readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-zinc-950 backdrop-blur-[1.2px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_20%,rgba(255,180,60,0.10),transparent_55%)]" />
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.15)_1px,transparent_0)] bg-[length:24px_24px]" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center px-5 sm:px-6">
          <div className="max-w-xl w-full animate-[fadeIn_0.7s_var(--ease-mechanical)]">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight sm:tracking-[-0.04em] text-white leading-[1.05]">
              Find the best rides.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-white/70">
              RideScore analyzes elevation, wind, and route efficiency.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/results"
                className="inline-flex items-center justify-center rounded-full bg-[#f5b54a] px-6 py-3.5 text-sm font-medium text-zinc-950 transition-all duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#f7c060] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b54a]/60 w-full sm:w-auto"
              >
                Score My Ride
              </Link>
              <Link
                href="/features"
                className="text-sm text-white/70 hover:text-white/90 underline-offset-4 hover:underline"
              >
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
