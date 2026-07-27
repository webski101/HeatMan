import type { Coordinate, TravelMode } from "@/lib/types";

interface DirectionsRequest {
  origin?: Coordinate;
  destination?: Coordinate;
  mode?: TravelMode;
}

export async function POST(request: Request) {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    return Response.json(
      {
        configured: false,
        source: "demo",
        message:
          "Mapbox routing is not configured. HeatGuard is using seeded Miami route alternatives.",
      },
      { status: 200 },
    );
  }

  const body = (await request.json()) as DirectionsRequest;
  const origin = validCoordinate(body.origin);
  const destination = validCoordinate(body.destination);
  const mode = body.mode === "walking" ? "walking" : "cycling";

  if (!origin || !destination) {
    return Response.json(
      {
        error: true,
        message:
          "Both route endpoints must be valid [longitude, latitude] coordinates.",
      },
      { status: 400 },
    );
  }

  const coordinates = `${origin.join(",")};${destination.join(",")}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordinates}`,
  );
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "true");
  url.searchParams.set("access_token", token);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json();

  if (!response.ok) {
    return Response.json(
      {
        error: true,
        message: "Mapbox could not calculate route alternatives.",
        detail:
          typeof payload?.message === "string"
            ? payload.message
            : "Unknown Mapbox response",
      },
      { status: response.status },
    );
  }

  return Response.json({
    configured: true,
    source: "mapbox",
    routes: (payload.routes ?? []).map(
      (
        route: {
          duration: number;
          distance: number;
          geometry: { coordinates: Coordinate[] };
          legs?: Array<{
            steps?: Array<{
              maneuver?: { instruction?: string };
              distance?: number;
              duration?: number;
            }>;
          }>;
        },
        index: number,
      ) => ({
        id: `mapbox-${index}`,
        name: index === 0 ? "Fastest" : `Alternative ${index + 1}`,
        durationSeconds: route.duration,
        distanceMeters: route.distance,
        coordinates: route.geometry?.coordinates ?? [],
        steps:
          route.legs?.flatMap((leg) =>
            (leg.steps ?? []).map((step) => ({
              instruction: step.maneuver?.instruction ?? "Continue",
              distanceM: step.distance ?? 0,
              durationS: step.duration ?? 0,
            })),
          ) ?? [],
      })),
  });
}

function validCoordinate(value: unknown): Coordinate | null {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return null;
  }
  const [longitude, latitude] = value;
  if (
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}
