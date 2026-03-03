import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 w-full z-50">
      <div className="border-b border-white/10 bg-zinc-950/65 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/cycleseer-logo.png"
              alt="CycleSeer"
              width={42}
              height={42}
              className="rounded-md object-contain"
              priority
            />
            <div className="leading-tight">
              <div className="text-white font-semibold tracking-tight">CycleSeer</div>
              <div className="text-xs text-white/60">Route scoring for cyclists</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-white/75">
            <Link className="hover:text-white transition" href="/features">
              Features
            </Link>
            <Link className="hover:text-white transition" href="/about">
              About
            </Link>
          </nav>

          <div className="md:hidden flex items-center gap-3">
            <Link className="text-sm text-white/75 hover:text-white transition" href="/features">
              Features
            </Link>
            <Link className="text-sm text-white/75 hover:text-white transition" href="/about">
              About
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}