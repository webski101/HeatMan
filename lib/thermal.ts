import type {
  Coordinate,
  HeatPoint,
  RiderProfile,
  RouteCandidate,
  RouteStep,
} from "./types";

const DEFAULT_PROFILE: RiderProfile = {
  acclimatized: true,
  carryingLoadKg: 1,
  shiftMinutesCompleted: 20,
  hydrationMl: 750,
  heatSensitivity: "standard",
};

export function scoreRoute(
  input: {
    id: string;
    name: string;
    coordinates: Coordinate[];
    durationSeconds: number;
    distanceMeters: number;
    steps?: RouteStep[];
  },
  heatPoints: HeatPoint[],
  profile: RiderProfile = DEFAULT_PROFILE,
): RouteCandidate {
  const coordinates = input.coordinates.length >= 2 ? input.coordinates : [];
  const segmentDistances = coordinates.slice(1).map((coordinate, index) =>
    haversineMeters(coordinates[index], coordinate),
  );
  const totalGeometryMeters =
    segmentDistances.reduce((sum, value) => sum + value, 0) || input.distanceMeters || 1;
  const samples = coordinates.map((coordinate) => nearestTemperature(coordinate, heatPoints));

  let heatLoad = 0;
  let hotMinutes = 0;
  let weightedTemperature = 0;
  let maximumTemperatureC = Number.NEGATIVE_INFINITY;

  segmentDistances.forEach((distance, index) => {
    const fraction = distance / totalGeometryMeters;
    const segmentMinutes = (input.durationSeconds / 60) * fraction;
    const temperatureC = (samples[index] + samples[index + 1]) / 2;
    weightedTemperature += temperatureC * fraction;
    maximumTemperatureC = Math.max(maximumTemperatureC, temperatureC);
    heatLoad += Math.max(0, temperatureC - 30) * segmentMinutes;
    if (temperatureC >= 32) hotMinutes += segmentMinutes;
  });

  if (!Number.isFinite(maximumTemperatureC)) {
    maximumTemperatureC = 32;
    weightedTemperature = 32;
  }

  const exposureModifier =
    (profile.heatSensitivity === "elevated" ? 14 : 0) +
    (profile.acclimatized ? 0 : 8) +
    Math.max(0, profile.carryingLoadKg - 2) * 1.4 +
    Math.max(0, profile.shiftMinutesCompleted - 90) * 0.035 +
    Math.max(0, 650 - profile.hydrationMl) * 0.012;
  const riskScore = clamp(
    Math.round(
      8 +
        heatLoad * 0.82 +
        Math.max(0, maximumTemperatureC - 33) * 7 +
        exposureModifier,
    ),
    0,
    100,
  );

  return {
    id: input.id,
    name: input.name,
    coordinates,
    durationMinutes: round(input.durationSeconds / 60, 1),
    distanceKm: round(input.distanceMeters / 1000, 2),
    averageTemperatureC: round(weightedTemperature, 1),
    maximumTemperatureC: round(maximumTemperatureC, 1),
    heatLoad: round(heatLoad, 1),
    hotMinutes: round(hotMinutes, 1),
    riskScore,
    riskBand: riskBand(riskScore),
    temperatureSource: heatPoints.some((point) => point.source === "fortyguard")
      ? "fortyguard"
      : "demo",
    steps: input.steps ?? [],
  };
}

export function chooseCoolestSafeRoute(routes: RouteCandidate[]) {
  if (!routes.length) return null;
  const fastestDuration = Math.min(...routes.map((route) => route.durationMinutes));
  const viable = routes.filter(
    (route) =>
      route.durationMinutes <= fastestDuration * 1.4 &&
      route.maximumTemperatureC < 39 &&
      route.riskBand !== "critical",
  );
  const pool = viable.length ? viable : routes;
  return [...pool].sort(
    (a, b) =>
      a.heatLoad - b.heatLoad ||
      a.maximumTemperatureC - b.maximumTemperatureC ||
      a.durationMinutes - b.durationMinutes,
  )[0];
}

export function buildBreakPlan(route: RouteCandidate) {
  const breaks: Array<{
    atMinute: number;
    title: string;
    instruction: string;
    amountMl: number;
  }> = [];

  if (route.maximumTemperatureC >= 34 || route.durationMinutes >= 16) {
    const atMinute = Math.max(8, Math.min(15, Math.round(route.durationMinutes * 0.58)));
    breaks.push({
      atMinute,
      title: "Shade and water",
      instruction:
        "Pause off the roadway in full shade. Cool your neck and forearms before continuing.",
      amountMl: route.maximumTemperatureC >= 36 ? 300 : 250,
    });
  }

  if (route.riskBand === "high" || route.riskBand === "critical") {
    breaks.push({
      atMinute: Math.max(5, Math.round(route.durationMinutes * 0.82)),
      title: "Heat check",
      instruction:
        "Stop if you feel dizzy, confused, unusually weak, or stop sweating. Move indoors and seek help.",
      amountMl: 200,
    });
  }

  return breaks;
}

export function projectHeatPoints(
  heatPoints: HeatPoint[],
  horizonHours: number,
): HeatPoint[] {
  if (horizonHours <= 0) return heatPoints;
  const boundedHorizon = Math.min(6, horizonHours);
  return heatPoints.map((point, index) => {
    const urbanStorage =
      0.35 +
      Math.max(0, point.temperatureC - 31) * 0.08 +
      Math.sin(index * 0.73) * 0.14;
    const coolingDecay = point.temperatureC < 32 ? -0.12 * boundedHorizon : 0;
    return {
      ...point,
      temperatureC: round(
        point.temperatureC +
          urbanStorage * boundedHorizon +
          coolingDecay,
        1,
      ),
    };
  });
}

export function riskBand(score: number): RouteCandidate["riskBand"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "guarded";
  return "low";
}

function nearestTemperature(coordinate: Coordinate, heatPoints: HeatPoint[]) {
  if (!heatPoints.length) return 32;
  let nearest = heatPoints[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of heatPoints) {
    const distance = squaredDistance(coordinate, point.coordinate);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest.temperatureC;
}

function squaredDistance(a: Coordinate, b: Coordinate) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  return x * x + y * y;
}

function haversineMeters(a: Coordinate, b: Coordinate) {
  const earthRadiusM = 6_371_000;
  const latitudeA = toRadians(a[1]);
  const latitudeB = toRadians(b[1]);
  const deltaLatitude = toRadians(b[1] - a[1]);
  const deltaLongitude = toRadians(b[0] - a[0]);
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const h =
    sinLatitude * sinLatitude +
    Math.cos(latitudeA) * Math.cos(latitudeB) * sinLongitude * sinLongitude;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
