import type { Coordinate, HeatPoint } from "./types";

type GeoJsonFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

const TEMPERATURE_KEYS = [
  "temperature",
  "temperature_c",
  "temp",
  "temp_c",
  "value",
  "tcm",
];

export function extractHeatPoints(mapData: unknown): HeatPoint[] {
  const collection = mapData as { features?: GeoJsonFeature[] };
  if (!Array.isArray(collection?.features)) return [];

  const points: HeatPoint[] = [];
  collection.features.forEach((feature, index) => {
    const temperatureC = extractTemperature(feature.properties ?? {});
    const coordinate = featureCenter(feature);
    if (temperatureC !== null && coordinate !== null) {
      points.push({
        id: `fortyguard-${index}`,
        coordinate,
        temperatureC,
        source: "fortyguard",
      });
    }
  });
  return points;
}

function extractTemperature(properties: Record<string, unknown>) {
  for (const key of TEMPERATURE_KEYS) {
    const value = properties[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  const numeric = Object.entries(properties).find(
    ([key, value]) =>
      /temp|tcm/i.test(key) &&
      typeof value === "number" &&
      Number.isFinite(value),
  );
  return numeric ? (numeric[1] as number) : null;
}

function featureCenter(feature: GeoJsonFeature): Coordinate | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;

  if (
    feature.geometry?.type === "Point" &&
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return [coordinates[0], coordinates[1]];
  }

  const flattened: Coordinate[] = [];
  flattenCoordinates(coordinates, flattened);
  if (!flattened.length) return null;
  const sum = flattened.reduce(
    (accumulator, coordinate) => [
      accumulator[0] + coordinate[0],
      accumulator[1] + coordinate[1],
    ],
    [0, 0] as Coordinate,
  );
  return [sum[0] / flattened.length, sum[1] / flattened.length];
}

function flattenCoordinates(value: unknown, output: Coordinate[]) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((child) => flattenCoordinates(child, output));
}
