const GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: true, message: "Address search is not configured." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 3 || text.length > 180) {
    return Response.json(
      { error: true, message: "Enter a complete New York City pickup or drop-off." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    text: `${text}, New York City, New York`,
    size: "5",
    "boundary.country": "US",
    "boundary.rect.min_lon": "-74.2591",
    "boundary.rect.max_lon": "-73.7002",
    "boundary.rect.min_lat": "40.4774",
    "boundary.rect.max_lat": "40.9176",
  });
  const response = await fetch(`${GEOCODE_URL}?${params}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json(
      {
        error: true,
        message: payload?.error?.message ?? "Address search is unavailable.",
      },
      { status: response.status },
    );
  }

  const features = Array.isArray(payload?.features) ? payload.features : [];
  const matches = features
    .filter(
      (feature: { geometry?: { coordinates?: unknown[] } }) =>
        Array.isArray(feature?.geometry?.coordinates) &&
        feature.geometry.coordinates.length >= 2,
    )
    .map(
      (feature: {
        geometry: { coordinates: [number, number] };
        properties?: { label?: string; name?: string };
      }) => ({
        label:
          feature.properties?.label ?? feature.properties?.name ?? text,
        coordinate: feature.geometry.coordinates,
      }),
    );

  if (!matches.length) {
    return Response.json(
      { error: true, message: `No New York City match was found for “${text}”.` },
      { status: 404 },
    );
  }
  return Response.json({ source: "openrouteservice", matches });
}
