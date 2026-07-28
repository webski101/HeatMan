import { chooseCoolestSafeRoute, scoreRoute } from "./thermal";
import type {
  Coordinate,
  HeatPoint,
  RiderProfile,
  RouteAnalysis,
  TravelMode,
} from "./types";

export const DEFAULT_ORIGIN: Coordinate = [-80.1937, 25.7743];
export const DEFAULT_DESTINATION: Coordinate = [-80.1848, 25.7913];

export const DEFAULT_PROFILE: RiderProfile = {
  acclimatized: true,
  carryingLoadKg: 4,
  shiftMinutesCompleted: 132,
  hydrationMl: 750,
};

export function createDemoHeatPoints(): HeatPoint[] {
  const west = -80.201;
  const south = 25.765;
  const columns = 10;
  const rows = 12;
  const longitudeStep = 0.0021;
  const latitudeStep = 0.0021;
  const points: HeatPoint[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const riverCooling = row < 5 && column > 2 ? -1.6 : 0;
      const parkCooling = column > 5 && row > 7 ? -2.1 : 0;
      const asphaltHeat = column < 4 && row > 5 ? 2.7 : 0;
      const variation = Math.sin(row * 1.7 + column * 0.9) * 1.1;
      points.push({
        id: `demo-${row}-${column}`,
        coordinate: [
          west + column * longitudeStep,
          south + row * latitudeStep,
        ],
        temperatureC: round(
          33.2 + riverCooling + parkCooling + asphaltHeat + variation,
          1,
        ),
        source: "demo",
      });
    }
  }

  return points;
}

export function createDemoAnalysis(
  mode: TravelMode,
  heatPoints = createDemoHeatPoints(),
  profile = DEFAULT_PROFILE,
): RouteAnalysis {
  const speedFactor = mode === "walking" ? 2.1 : 1;
  const routeInputs = [
    {
      id: "cool-corridor",
      name: "Cool corridor",
      coordinates: [
        DEFAULT_ORIGIN,
        [-80.1942, 25.779],
        [-80.1904, 25.7836],
        [-80.1882, 25.7879],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 17.8 * 60 * speedFactor,
      distanceMeters: 3_260,
      steps: [
        {
          instruction: "Use the shaded northbound corridor",
          distanceM: 1_050,
          durationS: 330 * speedFactor,
        },
        {
          instruction: "Cross west of the exposed arterial",
          distanceM: 980,
          durationS: 310 * speedFactor,
        },
        {
          instruction: "Continue through the park edge",
          distanceM: 1_230,
          durationS: 428 * speedFactor,
        },
      ],
    },
    {
      id: "fastest",
      name: "Fastest",
      coordinates: [
        DEFAULT_ORIGIN,
        [-80.1905, 25.7792],
        [-80.1876, 25.7854],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 14.4 * 60 * speedFactor,
      distanceMeters: 2_910,
      steps: [
        {
          instruction: "Take the direct northbound arterial",
          distanceM: 1_740,
          durationS: 500 * speedFactor,
        },
        {
          instruction: "Continue to the delivery stop",
          distanceM: 1_170,
          durationS: 364 * speedFactor,
        },
      ],
    },
    {
      id: "bay-shade",
      name: "Bay shade",
      coordinates: [
        DEFAULT_ORIGIN,
        [-80.1963, 25.7795],
        [-80.1948, 25.7858],
        [-80.1898, 25.7906],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 19.6 * 60 * speedFactor,
      distanceMeters: 3_640,
      steps: [
        {
          instruction: "Move toward the river cooling corridor",
          distanceM: 1_250,
          durationS: 390 * speedFactor,
        },
        {
          instruction: "Follow the shaded bayfront approach",
          distanceM: 1_430,
          durationS: 450 * speedFactor,
        },
        {
          instruction: "Turn inland for the final stop",
          distanceM: 960,
          durationS: 336 * speedFactor,
        },
      ],
    },
  ];

  const candidates = routeInputs.map((route) =>
    scoreRoute(route, heatPoints, profile),
  );
  const recommended = chooseCoolestSafeRoute(candidates) ?? candidates[0];

  return {
    candidates,
    recommendedRouteId: recommended.id,
    generatedAt: new Date().toISOString(),
    dataMode: heatPoints.some((point) => point.source === "fortyguard")
      ? "live"
      : "demo",
  };
}

export const COOLING_STOPS = [
  {
    id: "stop-1",
    name: "Bayfront shade stop",
    coordinate: [-80.1904, 25.7836] as Coordinate,
    type: "shade",
    note: "Covered seating and bottle refill",
  },
  {
    id: "stop-2",
    name: "Government Center cooling point",
    coordinate: [-80.1951, 25.7758] as Coordinate,
    type: "indoor",
    note: "Air-conditioned public lobby",
  },
];

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
