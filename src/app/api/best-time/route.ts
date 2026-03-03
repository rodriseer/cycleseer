import { NextResponse } from "next/server";
import { fetchHourlyWXAt } from "@/lib/weather";
import { computeBestRideWindow } from "@/lib/bestRideWindow";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const bearing = Number(url.searchParams.get("bearing"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "lat and lng are required" },
        { status: 400 }
      );
    }

    const routeBearingDeg = Number.isFinite(bearing) ? bearing : 0;

    // Open-Meteo returns data in location timezone when using "auto"
    const hourly = await fetchHourlyWXAt(
      { lat, lng },
      "auto"
    );

    const result = computeBestRideWindow({
      hourly: {
        times: hourly.times,
        wind_mps: hourly.wind_mps,
        wind_from_deg: hourly.wind_from_deg,
        temp_c: hourly.temp_c,
        precip_prob: hourly.precip_prob,
      },
      routeBearingDeg,
      windowHours: 1.5,
      horizonHours: 24,
    });

    return NextResponse.json({
      ok: true,
      best: result.best,
      fallbackMessage: result.fallbackMessage,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
