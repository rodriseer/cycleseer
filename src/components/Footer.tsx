export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-5 py-10 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div className="text-sm text-white/70">
          © {new Date().getFullYear()} CycleSeer. Built for cyclists who ride outside.
        </div>
        <div className="flex flex-col md:items-end gap-1">
          <div className="text-xs text-white/50">
            Performance-first UI • Weather-aware routing • Timing insights
          </div>
          <a
            href="https://theseerlab.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/45 hover:text-white/70 transition-colors"
          >
            A product by theseerlab.com
          </a>
        </div>
      </div>
    </footer>
  );
}