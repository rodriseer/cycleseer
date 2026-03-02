import Link from "next/link";

export default function TopNavModern() {
  return (
    <header className="absolute top-0 left-0 right-0 z-20">
      <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/10 backdrop-blur-xl" />
          <span className="font-display text-lg tracking-tight">CycleSeer</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-white/80">
          <a href="#features" className="hover:text-white">
            Features
          </a>
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#cta" className="hover:text-white">
            Get started
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden sm:inline-flex text-sm text-white/80 hover:text-white"
          >
            Sign in
          </Link>

          {/* If you already have a results page, keep this. If not, change to "/" */}
          <Link
            href="/results"
            className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold bg-white/10 border border-white/15 hover:bg-white/15 transition"
          >
            Plan a ride
          </Link>
        </div>
      </div>
    </header>
  );
}