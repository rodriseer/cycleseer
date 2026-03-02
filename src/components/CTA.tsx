import Link from "next/link";
import Button from "@/components/ui/Button";
import GlassCard from "@/components/ui/GlassCard";

export default function CTA() {
  return (
    <section id="cta" className="bg-[#0B0F14] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <GlassCard className="p-8 md:p-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <h3 className="font-display text-2xl md:text-3xl tracking-tight">
                Ready to plan your next ride?
              </h3>
              <p className="mt-2 text-sm md:text-base text-white/65">
                Get route scoring and timing recommendations in seconds.
              </p>
            </div>

            <div className="flex gap-3">
              <Link href="/results">
                <Button>Plan a ride</Button>
              </Link>
              <a href="#features">
                <Button variant="ghost">Explore</Button>
              </a>
            </div>
          </div>
        </GlassCard>

        <footer className="mt-10 text-xs text-white/45">
          © {new Date().getFullYear()} CycleSeer. Built for cyclists.
        </footer>
      </div>
    </section>
  );
}