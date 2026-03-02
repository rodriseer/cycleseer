import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing MAPBOX_TOKEN in .env.local" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const proximity = searchParams.get("proximity") ?? ""; // optional "lng,lat"

    if (q.length < 2) {
      return NextResponse.json({ ok: true, suggestions: [] });
    }

    // Mapbox forward geocode for suggestions
    const url =
      "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
      encodeURIComponent(q) +
      `.json?access_token=${encodeURIComponent(token)}` +
      `&autocomplete=true&limit=6&types=address,poi,place,postcode` +
      `&language=en` +
      (proximity ? `&proximity=${encodeURIComponent(proximity)}` : "");

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Suggest failed (${r.status})`);
    const j = await r.json();

    const suggestions =
      (j?.features ?? []).map((f: any) => ({
        id: String(f?.id ?? f?.place_name ?? Math.random()),
        place_name: String(f?.place_name ?? ""),
        center: Array.isArray(f?.center) ? ([f.center[0], f.center[1]] as [number, number]) : null,
      })) ?? [];

    return NextResponse.json({ ok: true, suggestions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}