export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-5 py-10 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="text-sm text-white/70">
          © {new Date().getFullYear()} CycleSeer. Built for cyclists who ride outside.
        </div>
        <div className="text-xs text-white/50">
          Performance-first UI • Weather-aware routing • Timing insights
        </div>
      </div>
    </footer>
  );
}