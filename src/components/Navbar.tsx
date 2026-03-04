import Link from "next/link";

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 w-full z-50">
      <div className="border-b border-white/10 bg-zinc-950/65 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex flex-col leading-tight">
            <span className="font-display text-lg tracking-tight text-white">
              CycleSeer
            </span>
            <span className="text-[11px] uppercase tracking-[0.24em] text-white/55">
              Ride Intelligence
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-white/75">
            <Link
              className="hover:text-white transition"
              href="/features#how-it-works"
            >
              How it works
            </Link>
            <Link
              className="hover:text-white transition"
              href="/features#explore"
            >
              Explore
            </Link>
            <Link
              className="hover:text-white transition"
              href="/features#ride-score"
            >
              RideScore
            </Link>
            <Link
              href="/results"
              className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white border border-white/15 hover:bg-white/15 transition"
            >
              Open App
            </Link>
          </nav>

          <div className="md:hidden flex items-center gap-3">
            <Link
              href="/results"
              className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white border border-white/15 hover:bg-white/15 transition"
            >
              Open App
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}