import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat and lng are required" }, { status: 400 });
    }

    // Open-Meteo: current wind speed + direction (free)
    const api =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lng))}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=mph` +
      `&timezone=auto`;

    const r = await fetch(api, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `Weather fetch failed (${r.status})` }, { status: 502 });
    }
    const j = await r.json();

    const cur = j?.current;
    const wind_mph = Number(cur?.wind_speed_10m);
    const wind_dir_deg = Number(cur?.wind_direction_10m);

    if (!Number.isFinite(wind_mph) || !Number.isFinite(wind_dir_deg)) {
      return NextResponse.json({ ok: false, error: "Weather data missing" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      wind_mph,
      wind_dir_deg,
      time: cur?.time ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}