import type { Coordinate } from "@/lib/types";

export async function GET(request: Request) {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    return Response.json({
      configured: false,
      message:
        "Mapbox address search is not configured. HeatMan will keep the Miami sample route active.",
    });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 256) {
    return Response.json(
      { error: true, message: "Enter a valid starting point or destination." },
      { status: 400 },
    );
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", "-80.1918,25.7617");
  url.searchParams.set("bbox", "-80.35,25.60,-80.05,25.95");
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        error: true,
        message: "The address search service could not resolve this location.",
      },
      { status: response.status },
    );
  }

  const feature = payload?.features?.[0];
  const coordinate = validCoordinate(feature?.geometry?.coordinates);
  if (!coordinate) {
    return Response.json(
      {
        error: true,
        message: `No Miami-area match was found for “${query}”.`,
      },
      { status: 404 },
    );
  }

  return Response.json({
    configured: true,
    coordinate,
    label:
      feature?.properties?.full_address ??
      feature?.properties?.name ??
      query,
  });
}

function validCoordinate(value: unknown): Coordinate | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number"
  ) {
    return null;
  }
  return [value[0], value[1]];
}
