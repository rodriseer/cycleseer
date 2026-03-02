import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing MAPBOX_TOKEN in .env.local" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const lng = Number(searchParams.get("lng"));
    const lat = Number(searchParams.get("lat"));

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return NextResponse.json({ ok: false, error: "lng and lat are required" }, { status: 400 });
    }

    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      `&limit=1&language=en`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Reverse geocode failed (${r.status})`);
    const j = await r.json();

    const feat = j?.features?.[0];
    const place_name = String(feat?.place_name ?? "Current location");

    return NextResponse.json({ ok: true, place_name });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}