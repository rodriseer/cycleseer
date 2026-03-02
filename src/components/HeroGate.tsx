"use client";

import Image from "next/image";

export default function HeroGate() {
  function goToFeatures() {
    const el = document.getElementById("features");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="relative min-h-screen w-full overflow-hidden">
      {/* Background image */}
      <Image
        src="/iStock-1402134774.jpg"
        alt="Cyclist riding at golden hour"
        fill
        priority
        className="object-cover"
      />

      {/* Apple-ish glass gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/75" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_70%_60%,rgba(246,166,60,0.12),transparent_45%)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-28 pb-16 flex min-h-screen items-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/80 backdrop-blur-xl">
            CycleSeer
            <span className="h-1 w-1 rounded-full bg-white/40" />
            Route scoring for cyclists
          </div>

          <h1 className="mt-6 font-display tracking-tight text-5xl md:text-7xl leading-[1.02]">
            Open CycleSeer
          </h1>

          <p className="mt-4 text-base md:text-lg text-white/70 max-w-xl">
            Choose routes and timing with a clean score and a glassy, performance-first UI.
          </p>

          {/* Main CTA */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={goToFeatures}
              className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-semibold bg-white/15 border border-white/20 backdrop-blur-xl hover:bg-white/20 transition shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
            >
              Open CycleSeer
            </button>

            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-semibold text-white/85 border border-white/15 bg-white/5 hover:bg-white/10 transition backdrop-blur-xl"
            >
              View features
            </a>
          </div>

          {/* Small hint */}
          <div className="mt-10 text-xs text-white/55">
            Tip: This is a “gate” screen. Click Open to jump into the product.
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0B0F14]" />
    </section>
  );
}