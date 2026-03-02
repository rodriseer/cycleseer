import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative h-screen flex items-center justify-center text-center">
      <div className="absolute inset-0">
        <Image
          src="/hero.jpg"
          alt="Cyclist"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 max-w-3xl px-6">
        <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
          Score Your Ride.
        </h1>

        <p className="mt-6 text-lg text-white/80">
          Intelligent route scoring for cyclists who care about performance.
        </p>

        <div className="mt-10 flex justify-center gap-6">
          <Link
            href="/results"
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 transition rounded-full text-white font-medium shadow-lg"
          >
            Analyze Route
          </Link>

          <Link
            href="#features"
            className="px-8 py-4 border border-white/30 hover:bg-white/10 transition rounded-full text-white"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
