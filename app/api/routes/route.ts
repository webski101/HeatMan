import type { Coordinate, TravelMode } from "@/lib/types";

interface DirectionsRequest {
  origin?: Coordinate;
  destination?: Coordinate;
  mode?: TravelMode;
}

interface OrsFeature {
  geometry?: { coordinates?: Coordinate[] };
  properties?: {
    summary?: { duration?: number; distance?: number };
    segments?: Array<{
      steps?: Array<{
        instruction?: string;
        distance?: number;
        duration?: number;
      }>;
    }>;
  };
}

export async function POST(request: Request) {
  const token = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!token) {
    return Response.json(
      {
        configured: false,
        source: "demo",
        message:
          "OpenRouteService is not configured. HeatMan is using seeded New York route alternatives.",
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

  const profile = mode === "walking" ? "foot-walking" : "cycling-regular";
  const { response, payload } = await requestDirections(
    token,
    profile,
    [origin, destination],
    true,
  );

  if (!response.ok) {
    return Response.json(
      {
        error: true,
        message: "OpenRouteService could not calculate route alternatives.",
        detail: readableProviderError(payload),
      },
      { status: response.status },
    );
  }

  const features: OrsFeature[] = Array.isArray(payload?.features)
    ? payload.features
    : [];
  if (!features.length) {
    return Response.json(
      {
        error: true,
        message: "OpenRouteService returned no usable route alternatives.",
      },
      { status: 502 },
    );
  }

  if (features.length < 3) {
    const corridorRequests = buildCorridorWaypoints(origin, destination).map(
      (via) =>
        requestDirections(token, profile, [origin, via, destination], false),
    );
    const corridorResults = await Promise.allSettled(corridorRequests);
    for (const result of corridorResults) {
      if (result.status !== "fulfilled" || !result.value.response.ok) continue;
      const corridorFeatures = Array.isArray(result.value.payload?.features)
        ? (result.value.payload.features as OrsFeature[])
        : [];
      for (const feature of corridorFeatures) {
        if (features.length >= 3) break;
        if (feature.geometry?.coordinates?.length) features.push(feature);
      }
    }
  }

  return Response.json({
    configured: true,
    source: "openrouteservice",
    routes: features.slice(0, 3).map((feature, index) => ({
        id: `ors-${index}`,
        name: index === 0 ? "Fastest" : `Alternative ${index + 1}`,
        durationSeconds: feature.properties?.summary?.duration ?? 0,
        distanceMeters: feature.properties?.summary?.distance ?? 0,
        coordinates: feature.geometry?.coordinates ?? [],
        steps:
          feature.properties?.segments?.flatMap((segment) =>
            (segment.steps ?? []).map((step) => ({
              instruction: step.instruction ?? "Continue",
              distanceM: step.distance ?? 0,
              durationS: step.duration ?? 0,
            })),
          ) ?? [],
      }),
    ),
  });
}

async function requestDirections(
  token: string,
  profile: string,
  coordinates: Coordinate[],
  alternatives: boolean,
) {
  const response = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: "POST",
      headers: {
        accept: "application/geo+json, application/json",
        authorization: token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        coordinates,
        ...(alternatives
          ? {
              alternative_routes: {
                target_count: 3,
                weight_factor: 1.6,
                share_factor: 0.7,
              },
            }
          : {}),
        instructions: true,
        language: "en",
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function buildCorridorWaypoints(
  origin: Coordinate,
  destination: Coordinate,
): Coordinate[] {
  const deltaLongitude = destination[0] - origin[0];
  const deltaLatitude = destination[1] - origin[1];
  const length = Math.hypot(deltaLongitude, deltaLatitude) || 1;
  const offset = Math.min(0.006, Math.max(0.0015, length * 0.18));
  const perpendicularLongitude = -deltaLatitude / length;
  const perpendicularLatitude = deltaLongitude / length;
  const midpoint: Coordinate = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2,
  ];

  return [-1, 1].map((direction) => [
    midpoint[0] + perpendicularLongitude * offset * direction,
    midpoint[1] + perpendicularLatitude * offset * direction,
  ]);
}

function readableProviderError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Unknown provider response";
  const value = payload as {
    error?: string | { message?: string };
    message?: string;
  };
  if (typeof value.error === "string") return value.error;
  if (typeof value.error?.message === "string") return value.error.message;
  if (typeof value.message === "string") return value.message;
  return "Unknown provider response";
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
